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

// soft ocean blue with enough self-glow that the night side stays friendly
const GLOBE_MATERIAL = new MeshPhongMaterial({
  color: "#cde9fa",
  emissive: "#a4d4f0",
  emissiveIntensity: 0.55,
  shininess: 6,
});

// every country gets its own candy pastel, like a storybook atlas
const PASTELS = ["#5ec98f", "#f8c660", "#f88f79", "#a98ee6", "#54b8e8", "#f47fb0"];
const hashStr = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const countryColor = (f) => PASTELS[hashStr(f.properties?.name || "?") % PASTELS.length];

const CORAL = "255,56,92";
const TEAL = "0,166,153";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function GlobeView({ stops, selectedId, onSelect, onBackgroundClick }) {
  const globeRef = useRef();
  const markerPressAt = useRef(0);
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
    c.autoRotateSpeed = 0.5;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 135;
    c.maxDistance = 480;
    g.pointOfView({ lat: 30, lng: -5, altitude: 2.05 }, 0);
  }, []);

  // The globe raycasts through the HTML markers, so pressing a marker also
  // produces a globe click one frame after pointerup — ignore it so it can't
  // clobber the selection and restart the idle spin.
  const handleGlobeClick = useCallback(() => {
    if (Date.now() - markerPressAt.current < 300) return;
    onBackgroundClick();
  }, [onBackgroundClick]);

  const makeMarker = useCallback(
    (d) => {
      const el = document.createElement("div");
      el.className = "marker" + (d.sel ? " sel" : "");
      el.innerHTML =
        '<div class="m-dot"></div><div class="m-pill"><span class="m-num">' +
        (d.idx + 1) +
        "</span>" +
        esc(d.city) +
        "</div>";
      el.style.pointerEvents = "auto";
      // Select on pointerdown: the globe library synthesizes its own click on
      // pointerup (capture phase + next animation frame), which a click
      // handler's stopPropagation can't intercept.
      el.onpointerdown = () => {
        markerPressAt.current = Date.now();
        sound.blip();
        onSelect(d.id);
      };
      el.onpointerup = () => {
        markerPressAt.current = Date.now();
      };
      el.onclick = (e) => e.stopPropagation();
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
      atmosphereColor="#9fd2f5"
      atmosphereAltitude={0.16}
      hexPolygonsData={LAND}
      hexPolygonResolution={3}
      hexPolygonMargin={0.62}
      hexPolygonAltitude={0.006}
      hexPolygonColor={countryColor}
      arcsData={arcs}
      arcColor={() => [`rgba(${CORAL},0)`, `rgba(${CORAL},0.9)`, `rgba(255,153,51,0.85)`]}
      arcAltitudeAutoScale={0.42}
      arcStroke={0.55}
      arcDashLength={0.14}
      arcDashGap={0.07}
      arcDashAnimateTime={4200}
      arcsTransitionDuration={500}
      ringsData={points}
      ringColor={(d) => (t) => `rgba(${d.sel ? CORAL : TEAL},${(d.sel ? 0.55 : 0.3) * (1 - t)})`}
      ringMaxRadius={(d) => (d.sel ? 4.5 : 2.3)}
      ringPropagationSpeed={(d) => (d.sel ? 2.2 : 1)}
      ringRepeatPeriod={(d) => (d.sel ? 900 : 2600)}
      ringAltitude={0.007}
      htmlElementsData={points}
      htmlElement={makeMarker}
      htmlAltitude={0.014}
      onGlobeReady={onReady}
      onGlobeClick={handleGlobeClick}
    />
  );
}
