<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/wordpress/');

$GLOBALS['paymorph_actions'] = array();
$GLOBALS['paymorph_filters'] = array();
$GLOBALS['paymorph_notices'] = array();
$GLOBALS['paymorph_remote_calls'] = array();
$GLOBALS['paymorph_remote_responses'] = array();
$GLOBALS['paymorph_orders'] = array();
$GLOBALS['paymorph_webhook_orders'] = array();
$GLOBALS['paymorph_options'] = array();
$GLOBALS['paymorph_currency'] = 'USD';

function add_action($hook, $callback): void {
    $GLOBALS['paymorph_actions'][$hook][] = $callback;
}

function add_filter($hook, $callback): void {
    $GLOBALS['paymorph_filters'][$hook][] = $callback;
}

function __($value, $domain = null) {
    return $value;
}

function esc_url($value) {
    return $value;
}

function esc_url_raw($value) {
    return $value;
}

function esc_html($value) {
    return $value;
}

function rest_url($path = ''): string {
    return 'https://store.test/wp-json/' . ltrim($path, '/');
}

function home_url(): string {
    return 'https://store.test';
}

function trailingslashit($value): string {
    return rtrim((string) $value, '/') . '/';
}

function untrailingslashit($value): string {
    return rtrim((string) $value, '/');
}

function wp_json_encode($value, $flags = 0): string|false {
    return json_encode($value, $flags);
}

function is_wp_error($value): bool {
    return false;
}

function wp_remote_request($url, $arguments) {
    $GLOBALS['paymorph_remote_calls'][] = array('url' => $url, 'arguments' => $arguments);
    if (0 === count($GLOBALS['paymorph_remote_responses'])) {
        throw new RuntimeException('Unexpected PayMorph API request');
    }
    return array_shift($GLOBALS['paymorph_remote_responses']);
}

function wp_remote_retrieve_response_code($response): int {
    return (int) $response['status'];
}

function wp_remote_retrieve_body($response): string {
    return (string) $response['body'];
}

function wc_add_notice($message, $type): void {
    $GLOBALS['paymorph_notices'][] = array('message' => $message, 'type' => $type);
}

function get_woocommerce_currency(): string {
    return $GLOBALS['paymorph_currency'];
}

function wc_get_order($order_id) {
    return $GLOBALS['paymorph_orders'][$order_id] ?? null;
}

function wc_get_orders($query): array {
    return $GLOBALS['paymorph_webhook_orders'];
}

function get_option($name, $default = null) {
    return $GLOBALS['paymorph_options'][$name] ?? $default;
}

function register_rest_route($namespace, $route, $arguments): void {
    $GLOBALS['paymorph_rest_route'] = compact('namespace', 'route', 'arguments');
}

function __return_true(): bool {
    return true;
}

class WP_REST_Request {
    public function __construct(
        private readonly array $headers,
        private readonly string $body
    ) {
    }

    public function get_header($name): string {
        return (string) ($this->headers[strtolower((string) $name)] ?? '');
    }

    public function get_body(): string {
        return $this->body;
    }
}

class WP_REST_Response {
    public function __construct(
        public readonly array $data,
        public readonly int $status
    ) {
    }
}

class WC_Payment_Gateway {
    public static array $configured = array();
    public string $id = '';
    public string $method_title = '';
    public string $method_description = '';
    public bool $has_fields = false;
    public array $supports = array();
    public array $form_fields = array();
    public array $settings = array();
    public string $title = '';
    public string $description = '';
    public string $enabled = 'no';

    public function init_settings(): void {
        $this->settings = self::$configured;
    }

    public function get_option($key, $default = '') {
        return $this->settings[$key] ?? $default;
    }

    public function process_admin_options(): void {
    }
}

final class PayMorph_Test_Order {
    public array $meta = array();
    public array $notes = array();
    public array $status_updates = array();
    public int $save_count = 0;
    public int $payment_complete_count = 0;
    public ?string $payment_transaction_id = null;

    public function __construct(
        private readonly int $id,
        private readonly string $total,
        private readonly string $order_key
    ) {
    }

    public function get_meta($key, $single = true) {
        return $this->meta[$key] ?? '';
    }

    public function update_meta_data($key, $value): void {
        $this->meta[$key] = $value;
    }

    public function update_status($status, $note): void {
        $this->status_updates[] = array('status' => $status, 'note' => $note);
    }

    public function save(): void {
        ++$this->save_count;
    }

    public function get_total(): string {
        return $this->total;
    }

    public function get_order_number(): string {
        return (string) $this->id;
    }

    public function get_order_key(): string {
        return $this->order_key;
    }

    public function get_id(): int {
        return $this->id;
    }

    public function is_paid(): bool {
        return $this->payment_complete_count > 0;
    }

    public function payment_complete($transaction_id): void {
        ++$this->payment_complete_count;
        $this->payment_transaction_id = (string) $transaction_id;
    }

    public function add_order_note($note): void {
        $this->notes[] = (string) $note;
    }
}

require dirname(__DIR__) . '/paymorph-woocommerce.php';
paymorph_woocommerce_bootstrap();

assert_same('12.34', paymorph_canonical_usd_amount('12.34'), 'canonical cents');
assert_same('12', paymorph_canonical_usd_amount('12.00'), 'canonical whole amount');
assert_same('12.3', paymorph_canonical_usd_amount('12.30'), 'canonical trailing zero');
assert_throws(fn() => paymorph_canonical_usd_amount('0.00'), 'zero amount rejected');
assert_throws(fn() => paymorph_canonical_usd_amount('1.001'), 'sub-cent amount rejected');
assert_throws(fn() => paymorph_canonical_usd_amount('1e2'), 'exponent amount rejected');

$order = new PayMorph_Test_Order(42, '19.90', 'wc_order_test');
$create_key = paymorph_order_idempotency_key($order, 'create');
assert_true(
    1 === preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/', $create_key),
    'idempotency key is a deterministic UUID v4 shape'
);
assert_same($create_key, paymorph_order_idempotency_key($order, 'create'), 'idempotency is stable');
assert_true($create_key !== paymorph_order_idempotency_key($order, 'publish'), 'operation keys differ');

WC_Payment_Gateway::$configured = array(
    'enabled' => 'yes',
    'api_base_url' => 'http://localhost:3000',
    'api_key' => 'pm_test_abcdefghijklmnopqrstuvwxyz',
    'recipient_address' => '0x1111111111111111111111111111111111111111',
);
$GLOBALS['paymorph_orders'][42] = $order;
$invoice_id = '11111111-1111-4111-8111-111111111111';
$GLOBALS['paymorph_remote_responses'] = array(
    api_response(201, array('id' => $invoice_id, 'publicSlug' => 'woo-order-42')),
    api_response(200, array('id' => $invoice_id, 'publicSlug' => 'woo-order-42')),
);
$gateway = new WC_Gateway_PayMorph();
$result = $gateway->process_payment(42);
assert_same('success', $result['result'], 'invoice checkout succeeds');
assert_same('http://localhost:3000/pay/woo-order-42', $result['redirect'], 'canonical checkout redirect');
assert_same($invoice_id, $order->meta['_paymorph_invoice_id'], 'invoice mapping persisted');
assert_same('woo-order-42', $order->meta['_paymorph_invoice_slug'], 'invoice slug persisted');
assert_same(2, count($GLOBALS['paymorph_remote_calls']), 'create and publish called exactly once');
$create_call = $GLOBALS['paymorph_remote_calls'][0];
$create_body = json_decode($create_call['arguments']['body'], true, flags: JSON_THROW_ON_ERROR);
assert_same('19.9', $create_body['amount'], 'API amount remains a canonical decimal string');
assert_same(10000, $create_body['recipients'][0]['bps'], 'single merchant receives 10000 bps');
assert_same($create_key, $create_call['arguments']['headers']['Idempotency-Key'], 'create key sent');

$call_count = count($GLOBALS['paymorph_remote_calls']);
$repeat = $gateway->process_payment(42);
assert_same('success', $repeat['result'], 'saved checkout retry succeeds');
assert_same($call_count, count($GLOBALS['paymorph_remote_calls']), 'saved checkout retry sends no API call');

$GLOBALS['paymorph_currency'] = 'EUR';
$euro_order = new PayMorph_Test_Order(43, '10.00', 'wc_order_euro');
$GLOBALS['paymorph_orders'][43] = $euro_order;
$failure = $gateway->process_payment(43);
assert_same('failure', $failure['result'], 'non-USD checkout is rejected');
assert_same($call_count, count($GLOBALS['paymorph_remote_calls']), 'non-USD checkout sends no API call');
$GLOBALS['paymorph_currency'] = 'USD';

$webhook_order = new PayMorph_Test_Order(44, '19.90', 'wc_order_webhook');
$webhook_order->meta['_paymorph_invoice_id'] = $invoice_id;
$GLOBALS['paymorph_webhook_orders'] = array($webhook_order);
$secret = 'test-webhook-secret-with-sufficient-entropy';
$GLOBALS['paymorph_options']['woocommerce_paymorph_settings'] = array('webhook_secret' => $secret);
$event = array(
    'type' => 'payment.settled',
    'data' => array(
        'invoiceId' => $invoice_id,
        'flareTxHash' => '0x' . str_repeat('a', 64),
        'receiptPath' => '/receipts/22222222-2222-4222-8222-222222222222',
    ),
);
$body = json_encode($event, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
$timestamp = (string) time();
$signature = hash_hmac('sha256', $timestamp . '.' . $body, $secret);
$accepted = paymorph_woocommerce_handle_webhook(
    new WP_REST_Request(
        array('paymorph-timestamp' => $timestamp, 'paymorph-signature' => $signature),
        $body
    )
);
assert_same(200, $accepted->status, 'valid settlement webhook accepted');
assert_same(1, $webhook_order->payment_complete_count, 'valid webhook marks order paid once');
assert_same($event['data']['flareTxHash'], $webhook_order->payment_transaction_id, 'Flare hash retained');
assert_same($event['data']['receiptPath'], $webhook_order->meta['_paymorph_receipt_path'], 'receipt retained');

$duplicate = paymorph_woocommerce_handle_webhook(
    new WP_REST_Request(
        array('paymorph-timestamp' => $timestamp, 'paymorph-signature' => $signature),
        $body
    )
);
assert_same(200, $duplicate->status, 'duplicate settlement webhook accepted idempotently');
assert_same(1, $webhook_order->payment_complete_count, 'duplicate webhook does not repay order');

$bad_signature = paymorph_woocommerce_handle_webhook(
    new WP_REST_Request(
        array('paymorph-timestamp' => $timestamp, 'paymorph-signature' => str_repeat('0', 64)),
        $body
    )
);
assert_same(401, $bad_signature->status, 'invalid HMAC rejected');

$old_timestamp = (string) (time() - 301);
$old_signature = hash_hmac('sha256', $old_timestamp . '.' . $body, $secret);
$expired = paymorph_woocommerce_handle_webhook(
    new WP_REST_Request(
        array('paymorph-timestamp' => $old_timestamp, 'paymorph-signature' => $old_signature),
        $body
    )
);
assert_same(401, $expired->status, 'expired webhook timestamp rejected');

$wrong_event_body = json_encode(
    array('type' => 'payment.pending', 'data' => $event['data']),
    JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
);
$wrong_event_signature = hash_hmac('sha256', $timestamp . '.' . $wrong_event_body, $secret);
$wrong_event = paymorph_woocommerce_handle_webhook(
    new WP_REST_Request(
        array('paymorph-timestamp' => $timestamp, 'paymorph-signature' => $wrong_event_signature),
        $wrong_event_body
    )
);
assert_same(400, $wrong_event->status, 'non-settlement event cannot pay an order');

fwrite(STDOUT, "PayMorph WooCommerce boundary smoke: PASS\n");

function api_response(int $status, array $data): array {
    return array(
        'status' => $status,
        'body' => json_encode(array('data' => $data, 'error' => null, 'requestId' => 'test'), JSON_THROW_ON_ERROR),
    );
}

function assert_true(bool $condition, string $label): void {
    if (!$condition) {
        throw new RuntimeException('Assertion failed: ' . $label);
    }
}

function assert_same($expected, $actual, string $label): void {
    if ($expected !== $actual) {
        throw new RuntimeException(
            sprintf(
                'Assertion failed: %s; expected %s, received %s',
                $label,
                var_export($expected, true),
                var_export($actual, true)
            )
        );
    }
}

function assert_throws(callable $callback, string $label): void {
    try {
        $callback();
    } catch (Throwable) {
        return;
    }
    throw new RuntimeException('Assertion failed: ' . $label);
}
