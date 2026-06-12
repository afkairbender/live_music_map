import { Component } from "react";

// Class component — still the only way React lets you catch render errors.
// Styles are inline (not styles.css) so the boundary depends on nothing that
// could itself fail to load; Nunito just inherits from body when available.
const S = {
  wrap: {
    position: "fixed",
    inset: 0,
    display: "grid",
    placeItems: "center",
    padding: 24,
    background: "linear-gradient(180deg, #fef9f4 0%, #e3f2fd 100%)",
    color: "#222",
  },
  card: {
    background: "#fff",
    borderRadius: 24,
    boxShadow: "0 10px 36px rgba(34, 34, 34, 0.16)",
    padding: "40px 48px",
    maxWidth: 420,
    textAlign: "center",
  },
  title: { margin: "0 0 10px", fontSize: 24, fontWeight: 800 },
  sub: { margin: "0 0 24px", color: "#717171", lineHeight: 1.5 },
  btn: {
    background: "linear-gradient(135deg, #ff385c, #e31c5f)",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "12px 28px",
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    boxShadow: "0 3px 12px rgba(255, 56, 92, 0.3)",
  },
};

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("render crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={S.wrap}>
        <div style={S.card}>
          <h1 style={S.title}>🎶 The music skipped a beat</h1>
          <p style={S.sub}>
            Something went off-key and the app stumbled. A quick reload usually
            gets the show back on the road.
          </p>
          <button style={S.btn} onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
