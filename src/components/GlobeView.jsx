import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import { MeshPhongMaterial } from "three";
import { feature } from "topojson-client";
import countriesTopo from "../assets/countries-110m.json";
import * as sound from "../lib/sound.js";

// Quantization in the topojson collapses some tiny islands to a single
// repeated point, which makes h3's polygonToCells throw — drop those rings.
const hasArea = (poly) =>
  new Set((poly[0] || []).map((p) => p[0] + "," + p[1])).size >= 3;

const LAND = feature(countriesTopo, countriesTopo.objects.countries)
  .features.map((f) => {
    const polys =
      f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const valid = polys.filter(hasArea);
    return {
      ...f,
      geometry: { type: "MultiPolygon", coordinates: valid },
    };
  })
  .filter((f) => f.geometry.coordinates.length > 0);
const GLOBE_MATERIAL = new MeshPhongMaterial({
  color: "#060b0a",
  emissive: "#02160f",
  emissiveIntensity: 0.18,
  shininess: 4,
});
const ACC = "0,255,159";
const ACC2 = "255,45,150";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function GlobeView({ stops, selectedId, onSelect, onBackgroundClick }) {
  const globeRef = useRef();
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const points = useMemo(
    () => stops.map((s, idx) => ({ ...s, idx, sel: s.id === selectedId })),
    [stops, selectedId]
  );

  const arcs = useMemo(
    () =>
      stops.slice(1).map((s, i) => ({
        startLat: stops[i].lat,
        startLng: stops[i].lng,
        endLat: s.lat,
        endLng: s.lng,
      })),
    [stops]
  );

  // fly to the selected stop; spin idly when nothing is selected
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const s = stops.find((x) => x.id === selectedId);
    g.controls().autoRotate = !s;
    if (s) g.pointOfView({ lat: s.lat, lng: s.lng, altitude: 1.6 }, 900);
  }, [selectedId, stops]);

  const onReady = useCallback(() => {
    const g = globeRef.current;
    if (!g) return;
    const c = g.controls();
    c.autoRotate = true;
    c.autoRotateSpeed = 0.55;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 135;
    c.maxDistance = 480;
    g.pointOfView({ lat: 30, lng: -5, altitude: 2.1 }, 0);
  }, []);

  const makeMarker = useCallback(
    (d) => {
      const el = document.createElement("div");
      el.className = "marker" + (d.sel ? " sel" : "");
      el.innerHTML =
        '<div class="m-dot"></div><div class="m-label">' +
        String(d.idx + 1).padStart(2, "0") +
        " " +
        esc(d.city.toUpperCase()) +
        "</div>";
      el.style.pointerEvents = "auto";
      el.onclick = (e) => {
        e.stopPropagation();
        sound.blip();
        onSelect(d.id);
      };
      el.onmouseenter = () => sound.tick();
      return el;
    },
    [onSelect]
  );

  return (
    <Globe
      ref={globeRef}
      width={size.w}
      height={size.h}
      backgroundColor="rgba(0,0,0,0)"
      globeMaterial={GLOBE_MATERIAL}
      showAtmosphere
      atmosphereColor="#00ff9f"
      atmosphereAltitude={0.13}
      hexPolygonsData={LAND}
      hexPolygonResolution={3}
      hexPolygonMargin={0.72}
      hexPolygonAltitude={0.006}
      hexPolygonColor={() => "#2a8a67"}
      arcsData={arcs}
      arcColor={() => [`rgba(${ACC},0)`, `rgba(${ACC},0.9)`, `rgba(${ACC2},0.6)`]}
      arcAltitudeAutoScale={0.42}
      arcStroke={0.45}
      arcDashLength={0.45}
      arcDashGap={0.25}
      arcDashAnimateTime={2400}
      arcsTransitionDuration={500}
      ringsData={points}
      ringColor={(d) => (t) => `rgba(${d.sel ? ACC2 : ACC},${(d.sel ? 0.5 : 0.25) * (1 - t)})`}
      ringMaxRadius={(d) => (d.sel ? 4.5 : 2.3)}
      ringPropagationSpeed={(d) => (d.sel ? 2.2 : 1)}
      ringRepeatPeriod={(d) => (d.sel ? 900 : 2600)}
      ringAltitude={0.006}
      htmlElementsData={points}
      htmlElement={makeMarker}
      htmlAltitude={0.012}
      onGlobeReady={onReady}
      onGlobeClick={onBackgroundClick}
    />
  );
}
