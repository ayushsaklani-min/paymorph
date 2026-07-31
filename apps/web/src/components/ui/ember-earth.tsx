/** Decorative CSS globe; it has no relation to provider, quote, or payment state. */
export function EmberEarth() {
  return (
    <div aria-hidden="true" className="pm-earth-scene">
      <div className="pm-earth-halo" />
      <div className="pm-earth">
        <span className="pm-earth-grid pm-earth-grid-latitude" />
        <span className="pm-earth-grid pm-earth-grid-longitude" />
        <span className="pm-earth-land pm-earth-land-one" />
        <span className="pm-earth-land pm-earth-land-two" />
        <span className="pm-earth-land pm-earth-land-three" />
        <span className="pm-earth-atmosphere" />
      </div>
    </div>
  );
}
