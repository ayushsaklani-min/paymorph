<?php
/**
 * Plugin Name: PayMorph for WooCommerce
 * Description: Testnet-only PayMorph payment gateway. A WooCommerce order is marked paid only after a verified PayMorph payment.settled webhook.
 * Version: 0.1.0
 * Requires at least: 6.4
 * Requires PHP: 8.1
 * Requires Plugins: woocommerce
 * Text Domain: paymorph-woocommerce
 */

defined( 'ABSPATH' ) || exit;

add_action( 'plugins_loaded', 'paymorph_woocommerce_bootstrap' );
function paymorph_woocommerce_bootstrap() {
    if ( ! class_exists( 'WC_Payment_Gateway' ) ) {
        return;
    }

    class WC_Gateway_PayMorph extends WC_Payment_Gateway {
        public function __construct() {
            $this->id                 = 'paymorph';
            $this->method_title       = __( 'PayMorph (Testnet)', 'paymorph-woocommerce' );
            $this->method_description = __( 'Redirects customers to the testnet-only PayMorph checkout.', 'paymorph-woocommerce' );
            $this->has_fields         = false;
            $this->supports           = array( 'products' );

            $this->init_form_fields();
            $this->init_settings();
            $this->title              = $this->get_option( 'title', 'Pay with PayMorph' );
            $this->description        = $this->get_option( 'description', 'Complete your testnet payment with Xaman.' );
            $this->enabled            = $this->get_option( 'enabled', 'no' );

            add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, array( $this, 'process_admin_options' ) );
        }

        public function init_form_fields() {
            $this->form_fields = array(
                'enabled' => array(
                    'title'   => __( 'Enable', 'paymorph-woocommerce' ),
                    'type'    => 'checkbox',
                    'label'   => __( 'Enable PayMorph testnet checkout', 'paymorph-woocommerce' ),
                    'default' => 'no',
                ),
                'title' => array(
                    'title'   => __( 'Title', 'paymorph-woocommerce' ),
                    'type'    => 'text',
                    'default' => __( 'Pay with PayMorph', 'paymorph-woocommerce' ),
                ),
                'description' => array(
                    'title'   => __( 'Customer message', 'paymorph-woocommerce' ),
                    'type'    => 'textarea',
                    'default' => __( 'Complete your testnet payment with Xaman.', 'paymorph-woocommerce' ),
                ),
                'api_base_url' => array(
                    'title'       => __( 'PayMorph base URL', 'paymorph-woocommerce' ),
                    'type'        => 'url',
                    'default'     => 'http://localhost:3000',
                    'description' => __( 'Use your HTTPS PayMorph deployment for a real testnet checkout.', 'paymorph-woocommerce' ),
                ),
                'api_key' => array(
                    'title'       => __( 'PayMorph API key', 'paymorph-woocommerce' ),
                    'type'        => 'password',
                    'description' => __( 'Create a scoped pm_test_ key with invoices:write. This secret stays on the WooCommerce server.', 'paymorph-woocommerce' ),
                ),
                'recipient_address' => array(
                    'title'       => __( 'Coston2 settlement address', 'paymorph-woocommerce' ),
                    'type'        => 'text',
                    'description' => __( 'Your canonical 0x recipient address. This is the only payout recipient used by this MVP.', 'paymorph-woocommerce' ),
                ),
                'webhook_secret' => array(
                    'title'       => __( 'Webhook signing secret', 'paymorph-woocommerce' ),
                    'type'        => 'password',
                    'description' => sprintf( __( 'Copy this same secret into PayMorph merchant settings. Set the endpoint there to %s.', 'paymorph-woocommerce' ), esc_url( rest_url( 'paymorph/v1/webhook' ) ) ),
                ),
            );
        }

        public function process_payment( $order_id ) {
            $order = wc_get_order( $order_id );
            if ( ! $order ) {
                wc_add_notice( __( 'Order could not be loaded.', 'paymorph-woocommerce' ), 'error' );
                return array( 'result' => 'failure' );
            }
            if ( get_woocommerce_currency() !== 'USD' ) {
                wc_add_notice( __( 'PayMorph testnet checkout currently supports USD-denominated WooCommerce stores only.', 'paymorph-woocommerce' ), 'error' );
                return array( 'result' => 'failure' );
            }
            $checkout_url = $order->get_meta( '_paymorph_checkout_url', true );
            if ( $checkout_url ) {
                return array( 'result' => 'success', 'redirect' => esc_url_raw( $checkout_url ) );
            }

            try {
                $invoice = $this->create_and_publish_invoice( $order );
                $checkout_url = trailingslashit( untrailingslashit( $this->get_option( 'api_base_url' ) ) ) . 'pay/' . rawurlencode( $invoice['publicSlug'] );
                $order->update_meta_data( '_paymorph_invoice_id', $invoice['id'] );
                $order->update_meta_data( '_paymorph_checkout_url', $checkout_url );
                $order->update_status( 'pending', __( 'Awaiting PayMorph verified settlement.', 'paymorph-woocommerce' ) );
                $order->save();
                return array( 'result' => 'success', 'redirect' => $checkout_url );
            } catch ( Exception $error ) {
                wc_add_notice( esc_html( $error->getMessage() ), 'error' );
                return array( 'result' => 'failure' );
            }
        }

        private function create_and_publish_invoice( $order ) {
            $address = trim( (string) $this->get_option( 'recipient_address' ) );
            if ( ! preg_match( '/^0x[a-fA-F0-9]{40}$/', $address ) ) {
                throw new Exception( __( 'PayMorph Coston2 settlement address is not configured.', 'paymorph-woocommerce' ) );
            }
            $existing_id = (string) $order->get_meta( '_paymorph_invoice_id', true );
            $existing_slug = (string) $order->get_meta( '_paymorph_invoice_slug', true );
            if ( '' !== $existing_id && '' !== $existing_slug ) {
                $this->api_request( '/api/v1/invoices/' . rawurlencode( $existing_id ) . '/publish', 'POST', null, paymorph_order_idempotency_key( $order, 'publish' ) );
                return array( 'id' => $existing_id, 'publicSlug' => $existing_slug );
            }
            $amount = paymorph_canonical_usd_amount( (string) $order->get_total() );
            $now = new DateTimeImmutable( 'now', new DateTimeZone( 'UTC' ) );
            $payload = array(
                'title'           => sprintf( 'WooCommerce order #%s', $order->get_order_number() ),
                'description'     => sprintf( 'WooCommerce order %s', $order->get_order_key() ),
                'externalRef'     => 'woo-' . substr( hash( 'sha256', home_url() . ':' . $order->get_id() ), 0, 60 ),
                'denomination'    => 'USD',
                'amount'          => $amount,
                'settlementAsset' => 'FXRP',
                // PayMorph's OpenAPI contract requires canonical UTC RFC 3339
                // timestamps with a Z suffix, rather than a +00:00 offset.
                'expiresAt'       => $now->modify( '+24 hours' )->format( 'Y-m-d\\TH:i:s\\Z' ),
                'recipients'      => array( array( 'label' => 'WooCommerce merchant', 'address' => $address, 'bps' => 10000 ) ),
            );
            $key = paymorph_order_idempotency_key( $order, 'create' );
            $invoice = $this->api_request( '/api/v1/invoices', 'POST', $payload, $key );
            if ( empty( $invoice['id'] ) || empty( $invoice['publicSlug'] ) ) {
                throw new Exception( __( 'PayMorph returned an invalid invoice response.', 'paymorph-woocommerce' ) );
            }
            // Persist the external-order mapping before publication. A timeout
            // after invoice creation can therefore retry publication safely
            // without creating a replacement invoice after idempotency expiry.
            $order->update_meta_data( '_paymorph_invoice_id', $invoice['id'] );
            $order->update_meta_data( '_paymorph_invoice_slug', $invoice['publicSlug'] );
            $order->save();
            $this->api_request( '/api/v1/invoices/' . rawurlencode( $invoice['id'] ) . '/publish', 'POST', null, paymorph_order_idempotency_key( $order, 'publish' ) );
            return $invoice;
        }

        private function api_request( $path, $method, $payload, $idempotency_key ) {
            $base_url = untrailingslashit( (string) $this->get_option( 'api_base_url' ) );
            $api_key = trim( (string) $this->get_option( 'api_key' ) );
            if ( ! preg_match( '/^https?:\/\//', $base_url ) || ! preg_match( '/^pm_test_[A-Za-z0-9_-]{20,}$/', $api_key ) ) {
                throw new Exception( __( 'PayMorph API settings are incomplete.', 'paymorph-woocommerce' ) );
            }
            $response = wp_remote_request( $base_url . $path, array(
                'method'  => $method,
                'timeout' => 20,
                'headers' => array(
                    'Authorization'    => 'Bearer ' . $api_key,
                    'Content-Type'     => 'application/json',
                    'Idempotency-Key'  => $idempotency_key,
                ),
                'body' => null === $payload ? '' : wp_json_encode( $payload, JSON_UNESCAPED_SLASHES ),
            ) );
            if ( is_wp_error( $response ) ) {
                throw new Exception( __( 'PayMorph could not be reached. The order remains unpaid.', 'paymorph-woocommerce' ) );
            }
            $status = wp_remote_retrieve_response_code( $response );
            $body = json_decode( wp_remote_retrieve_body( $response ), true );
            if ( $status < 200 || $status >= 300 || ! is_array( $body ) || ! isset( $body['data'] ) ) {
                throw new Exception( __( 'PayMorph rejected the order invoice. The order remains unpaid.', 'paymorph-woocommerce' ) );
            }
            return $body['data'];
        }
    }

    add_filter( 'woocommerce_payment_gateways', function( $gateways ) {
        $gateways[] = 'WC_Gateway_PayMorph';
        return $gateways;
    } );
}

add_action( 'rest_api_init', function() {
    register_rest_route( 'paymorph/v1', '/webhook', array(
        'methods'             => 'POST',
        'callback'            => 'paymorph_woocommerce_handle_webhook',
        'permission_callback' => '__return_true',
    ) );
} );

function paymorph_woocommerce_handle_webhook( WP_REST_Request $request ) {
    $settings = get_option( 'woocommerce_paymorph_settings', array() );
    $secret = isset( $settings['webhook_secret'] ) ? (string) $settings['webhook_secret'] : '';
    $timestamp = (string) $request->get_header( 'paymorph-timestamp' );
    $signature = (string) $request->get_header( 'paymorph-signature' );
    $raw_body = $request->get_body();
    if ( '' === $secret || ! ctype_digit( $timestamp ) || abs( time() - (int) $timestamp ) > 300 ) {
        return new WP_REST_Response( array( 'error' => 'invalid webhook timestamp' ), 401 );
    }
    $expected = hash_hmac( 'sha256', $timestamp . '.' . $raw_body, $secret );
    if ( ! hash_equals( $expected, $signature ) ) {
        return new WP_REST_Response( array( 'error' => 'invalid webhook signature' ), 401 );
    }
    $event = json_decode( $raw_body, true );
    $invoice_id = isset( $event['data']['invoiceId'] ) ? (string) $event['data']['invoiceId'] : '';
    $flare_tx_hash = isset( $event['data']['flareTxHash'] ) ? (string) $event['data']['flareTxHash'] : '';
    $receipt_path = isset( $event['data']['receiptPath'] ) ? (string) $event['data']['receiptPath'] : '';
    if ( 'payment.settled' !== ( $event['type'] ?? '' ) || ! preg_match( '/^[0-9a-f-]{36}$/i', $invoice_id ) || ! preg_match( '/^0x[a-fA-F0-9]{64}$/', $flare_tx_hash ) || ! preg_match( '#^/receipts/[0-9a-f-]{36}$#i', $receipt_path ) ) {
        return new WP_REST_Response( array( 'error' => 'invalid settlement event' ), 400 );
    }
    $orders = wc_get_orders( array( 'meta_key' => '_paymorph_invoice_id', 'meta_value' => $invoice_id, 'limit' => 2 ) );
    if ( 1 !== count( $orders ) ) {
        return new WP_REST_Response( array( 'error' => 'order mapping not found' ), 404 );
    }
    $order = $orders[0];
    if ( ! $order->is_paid() ) {
        $order->payment_complete( $flare_tx_hash );
        $order->add_order_note( sprintf( 'PayMorph verified settlement: %s', $flare_tx_hash ) );
    }
    $order->update_meta_data( '_paymorph_receipt_path', $receipt_path );
    $order->save();
    return new WP_REST_Response( array( 'received' => true ), 200 );
}

function paymorph_canonical_usd_amount( $value ) {
    if ( ! preg_match( '/^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/', $value, $matches ) ) {
        throw new Exception( __( 'WooCommerce returned an invalid USD amount.', 'paymorph-woocommerce' ) );
    }
    $fraction = isset( $matches[2] ) ? rtrim( $matches[2], '0' ) : '';
    $canonical = $matches[1] . ( '' !== $fraction ? '.' . $fraction : '' );
    if ( ! preg_match( '/[1-9]/', $canonical ) ) {
        throw new Exception( __( 'PayMorph cannot create a zero-value invoice.', 'paymorph-woocommerce' ) );
    }
    return $canonical;
}

function paymorph_order_idempotency_key( $order, $operation ) {
    $hex = substr( hash( 'sha256', home_url() . ':' . $order->get_id() . ':' . $order->get_order_key() . ':' . $operation ), 0, 32 );
    // The API deliberately accepts UUID idempotency keys. Set RFC 4122 v4
    // version/variant nibbles while retaining deterministic order identity.
    return substr( $hex, 0, 8 ) . '-' . substr( $hex, 8, 4 ) . '-4' . substr( $hex, 13, 3 ) . '-8' . substr( $hex, 17, 3 ) . '-' . substr( $hex, 20 );
}
