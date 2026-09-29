import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Ship, Anchor, TrendingDown, TrendingUp, ShieldCheck, FileText,
  CheckCircle2, AlertTriangle, Activity, BarChart3, Target,
  Download, Printer, X, Scale, LayoutDashboard, Package,
  Globe, LineChart as LineChartIcon, ShoppingCart, Settings,
  Bell, Search, ChevronDown, ArrowRight, ArrowDown, RefreshCw, Layers, Zap, History, HelpCircle
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ComposedChart, BarChart, Bar, Cell, ReferenceLine, Area
} from 'recharts';
import AisLiveMap from './components/AisLiveMap';
import HistoricalIncidentReplay from './components/HistoricalIncidentReplay';
import { API } from './config';

const toast = (msg, type = 'success') => {
  const el = document.createElement('div');
  el.className = `fixed top-5 right-5 z-[9999] px-5 py-3 rounded-xl text-sm font-bold shadow-2xl transition-all ${
    type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
  }`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
};

const requestError = (err) => {
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map(item => item.msg).join(', ');
  if (typeof detail === 'string') return detail;
  if (err?.code === 'ERR_NETWORK') return 'backend is unreachable';
  return err?.message || 'unexpected server error';
};

// Only 3 real sections exist in the app
const NAV = [
  { icon: LayoutDashboard, label: 'Overview',           tab: 0 },
  { icon: ShoppingCart,    label: 'Procurement',        tab: 2 },
  { icon: Globe,           label: 'Port Watch',          tab: 3 },
  { icon: History,         label: 'Case Studies',        tab: 4 },
  { icon: HelpCircle,      label: 'Glossary / Help',    tab: 5 },
];

const TAB_LABELS = ['Overview', 'Shipment Analysis', 'Procurement', 'Port Watch', 'Case Studies', 'Glossary'];
const HORIZONS = ['7d', '14d', '30d', '60d'];

const PORT_PHOTOS = {
  Paradip:       '/port_paradip.jpg',
  Visakhapatnam: '/port_vizag.jpg',
  Haldia:        '/port_haldia.jpg',
};

// Custom Recharts Tooltip
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl text-xs">
      <p className="text-slate-400 mb-1.5 font-medium">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="font-bold" style={{ color: p.color }}>
          {p.name}: <span className="text-white">${typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function App() {
  const [loading, setLoading]               = useState(false);
  const [downloading, setDownloading]       = useState(false);
  const [result, setResult]                 = useState(null);
  const [history, setHistory]               = useState([]);
  const [congestion, setCongestion]         = useState(null);
  const [aisVessels, setAisVessels]         = useState([]);
  const [anchorages, setAnchorages]         = useState({});
  const [activeIncident, setActiveIncident] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [activeTab, setActiveTab]           = useState(0);
  const [activeHorizon, setActiveHorizon]   = useState('60d');
  const [chartView, setChartView]           = useState('rates');
  const [showModal, setShowModal]           = useState(false);
  const [scenarioParams, setScenarioParams] = useState({ bunker_delta: 0, port_queue_surge: 0, baltic_pct_delta: 0 });
  const [scenarioLoading, setScenarioLoading] = useState(false);

  const [form, setForm] = useState({
    cargo_type: 'Prime Hard Coking Coal',
    tonnage: 75000,
    origin_port: 'Gladstone',
    destination_port: 'Paradip',
    vessel_class: 'Kamsarmax',
    current_vlsfo_bunker: 620,
    current_baltic_p3a: 19500,
    current_ffa_30d: 21.0,
    incident_id: null,
  });

  const loadHistory = async (origin = form.origin_port, dest = form.destination_port) => {
    try {
      const r = await axios.get(`${API}/forecast-history?days=90&origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(dest)}`);
      const rows = r.data.dates.map((d, i) => ({ date: d.slice(5), spot: r.data.spot[i], ffa: r.data.ffa[i], bunker: r.data.bunker?.[i] }));
      setHistory(rows);
      return rows;
    } catch (err) {
      toast(`Forecast history unavailable: ${requestError(err)}`, 'error');
      return [];
    }
  };

  useEffect(() => {
    axios.get(`${API}/historical-incidents`).then(r => setIncidents(r.data?.incidents || [])).catch(() => {});
    loadHistory();
    axios.get(`${API}/port-congestion`).then(r => setCongestion(r.data))
      .catch(err => toast(`Port congestion unavailable: ${requestError(err)}`, 'error'));
    axios.get(`${API}/live-ais-tracking`).then(r => {
      setAisVessels(r.data.vessels || []);
      if (r.data.anchorages) setAnchorages(r.data.anchorages);
    }).catch(err => toast(`AIS feed unavailable: ${requestError(err)}`, 'error'));
    // Auto-run live calculation on first load so CP values are computed, not prefixed statics
    runAnalysis({
      cargo_type: 'Prime Hard Coking Coal',
      tonnage: 75000,
      origin_port: 'Gladstone',
      destination_port: 'Paradip',
      vessel_class: 'Kamsarmax',
      current_vlsfo_bunker: 620,
      current_baltic_p3a: 19500,
      current_ffa_30d: 21.0,
      incident_id: null,
    });
  }, []);

  const runAnalysis = async (payload = null) => {
    setLoading(true);
    const data = payload || form;
    try {
      const res = await axios.post(`${API}/analyze-shipment`, {
        ...data,
        tonnage: parseFloat(data.tonnage),
        current_vlsfo_bunker: parseFloat(data.current_vlsfo_bunker),
        current_baltic_p3a: parseFloat(data.current_baltic_p3a),
        current_ffa_30d: parseFloat(data.current_ffa_30d),
      });
      const output = res.data;
      if (!output || !output.layer3_ml_forecast) {
        throw new Error('Backend returned an empty or incomplete analysis result');
      }
      setResult(output);
      await loadHistory(data.origin_port, data.destination_port);
      const h = output.layer3_ml_forecast?.horizons || {};
      const band = Object.entries(h)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .map(([k, v]) => ({ date: `+${k}`, P50: Number(v.P50), P10: Number(v.P10), P90: Number(v.P90), horizon: k }));
      setHistory(prev => [...prev.slice(-60), ...band]);
      setShowModal(false);
      toast('Analysis complete — all 5 layers executed.');
    } catch (err) {
      toast(`Analysis failed: ${requestError(err)}`, 'error');
    }
    setLoading(false);
  };

  const handleReplay = async (inc) => {
    setActiveIncident(inc);
    setResult(null);
    const updated = { ...form, ...inc.inputs, incident_id: inc.id };
    setForm(updated);
    toast(`⏮ Replaying: ${inc.title}`);
    await runAnalysis(updated);
  };

  // Open PDF in new browser tab → user can view + use browser Print (Ctrl+P)
  const viewPDF = async (kind) => {
    setDownloading(true);
    try {
      const ep  = kind === 'audit' ? 'audit-receipt-pdf' : 'broker-order-pdf';
      const res = await axios.post(`${API}/${ep}`, form, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      toast(`Opened PDF — use Ctrl+P to print`);
    } catch (err) {
      toast(`PDF generation failed: ${requestError(err)}`, 'error');
    }
    setDownloading(false);
  };

  // Save PDF file directly to disk
  const downloadPDF = async (kind) => {
    setDownloading(true);
    try {
      const ep  = kind === 'audit' ? 'audit-receipt-pdf' : 'broker-order-pdf';
      const fn  = kind === 'audit' ? 'SAIL_CVC_CAG_Audit_Receipt.pdf' : 'SAIL_Broker_Cargo_Order.pdf';
      const res = await axios.post(`${API}/${ep}`, form, { responseType: 'blob' });
      const a   = document.createElement('a');
      a.href     = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      a.download = fn;
      a.click();
      toast(`Saved: ${fn}`);
    } catch (err) {
      toast(`PDF generation failed: ${requestError(err)}`, 'error');
    }
    setDownloading(false);
  };

  const downloadExcel = async () => {
    setDownloading(true);
    try {
      const res = await axios.post(`${API}/audit-receipt-xlsx`, form, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(res.data);
      a.download = 'SAIL_CVC_CAG_Audit_Receipt.xlsx';
      a.click();
      toast('Saved: SAIL_CVC_CAG_Audit_Receipt.xlsx');
    } catch (err) { toast(`Excel export failed: ${requestError(err)}`, 'error'); }
    setDownloading(false);
  };

  const runScenario = async () => {
    setScenarioLoading(true);
    try {
      const res = await axios.post(`${API}/scenario`, { ...form, ...scenarioParams });
      setResult(res.data);
      toast('What-if scenario calculated.');
    } catch (err) { toast(`Scenario failed: ${requestError(err)}`, 'error'); }
    setScenarioLoading(false);
  };

  // Derived
  const clearance = result?.layer2_clearance;
  const f3        = result?.layer3_ml_forecast;
  const f5        = result?.layer5_recommendation;
  const phys      = result?.layer2_naval_physics;
  const l4        = result?.layer4_queue_demurrage;
  const ffa       = parseFloat(form.current_ffa_30d) || 21;
  const p50       = f3?.P50_recommended_rate;
  const deltaPct  = p50 != null ? (((p50 - ffa) / ffa) * 100).toFixed(1) : null;
  const deltaPos  = Number(deltaPct) > 0;
  const shap      = f3?.shap_audit?.contributions_usd_mt || {};
  const shapRows  = Object.entries(shap).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const assigns   = f5?.portfolio_optimization?.schedule_assignments || [];
  const horizons  = f3?.horizons || {};
  const singleSavingsCr = f5?.single_voyage_spot_usd != null && f5?.single_voyage_coa_usd != null
    ? Math.max(0, ((f5.single_voyage_spot_usd - f5.single_voyage_coa_usd) * 84) / 10000000).toFixed(2)
    : '0.00';

  const horizonCards = [
    { label: '7d',  key: 7 },
    { label: '14d', key: 14 },
    { label: '30d', key: 30 },
    { label: '60d', key: 60 },
  ].map(h => {
    // Backend keys are strings such as "7d"; using the numeric key here left
    // every card stuck on "Calculating…" even after the API returned values.
    const hv = horizons[h.label];
    return {
      label: h.label,
      p50:   hv ? `$${hv.P50}` : 'Calculating…',
      range: hv ? `$${hv.P10} – $${hv.P90}` : 'live forecast pending',
    };
  });

  const congestionRows = congestion
    ? Object.entries(congestion).slice(0, 3)
    : [
        ['Paradip',       { queue: 7, Wq_days: 8,    rho: null  }],
        ['Visakhapatnam', { queue: 5, Wq_days: 2.08, rho: 0.714 }],
        ['Haldia',        { queue: 3, Wq_days: 8,    rho: 1.224 }],
      ];

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // 5-Stage Decision Flow — live-calculated from backend `decision_flow`.
  // Vertical flow: CP 1 → CP 2 → CP 3 → CP 4 → CP 5 (top to bottom)
  const CP_META = [
    {
      cp: 'Stage 1: Cost Floor',
      plainTitle: 'Lowest possible sailing cost',
      simple: 'The lowest cost at which the ship can sail. Any quote below this means the owner loses money — reject it.',
      contextFallback: '(Admiralty Boundary)',
      method: 'Fuel cost + daily running cost ÷ cargo weight',
      howToRead: 'Any bid below this floor = loss-making voyage. Reject it.',
    },
    {
      cp: 'Stage 2: Port Safety',
      plainTitle: 'Can the ship safely enter the port?',
      simple: 'Checks if the ship is too deep for the port. Needs APPROVED status with safe water gap under the ship.',
      contextFallback: '(UKC Safety Margin)',
      method: 'Ship depth vs port depth + tide window',
      howToRead: 'Needs APPROVED + safe gap ≥ 1.0 m. Else change ship or port.',
    },
    {
      cp: 'Stage 3: Market Price',
      plainTitle: 'Fair market price (AI prediction)',
      simple: 'The fair price the market should charge today, predicted by AI from fuel, Baltic index and past rates.',
      contextFallback: '(Baltic & FFA Equilibrium)',
      method: 'AI model (LightGBM) + market trend anchor',
      howToRead: 'Aim to fix near this price. Never cross the P90 ceiling.',
    },
    {
      cp: 'Stage 4: Congestion',
      plainTitle: 'Port waiting time + waiting charge',
      simple: 'How many days the ship will wait outside the port, and the extra waiting fee already added to your cost.',
      contextFallback: '(Demurrage Buffered)',
      method: 'Port queue simulation + waiting charge per day',
      howToRead: 'Waiting days × daily charge is already included in the cost.',
    },
    {
      cp: 'Stage 5: Final Action',
      plainTitle: 'Final advice — what to do now',
      simple: 'Final recommendation: lock price now in bulk deal (COA) to save money, or wait if market is too high.',
      contextFallback: '(Capital Preserved)',
      method: 'Bulk vs single-trip cost comparison',
      howToRead: 'COA when savings are shown and advice says BUY. Else hold.',
    },
  ];

  const liveFlow = result?.decision_flow;
  const displayStageValue = (live, index) => {
    if (!live) return { metric: null, context: null };
    let metric = live.metric || '';
    let context = live.context || live.submetric || '';
    if (index === 1 && (live.status === 'FAILED' || live.badge === 'RESTRICTED')) {
      metric = metric.replace('Draft Cleared', 'Draft restricted');
    }
    if (index === 4 && /₹0\.00\s*Cr/.test(context)) {
      context = 'No savings vs alternatives; risk avoided through the recommended action';
    }
    return { metric, context };
  };
  const checkpointsList = CP_META.map((meta, i) => {
    const live = liveFlow?.[i];
    const stageLabel = ['Stage 1: Cost Floor', 'Stage 2: Port Safety', 'Stage 3: Market Price', 'Stage 4: Congestion', 'Stage 5: Final Action'][i];
    const display = displayStageValue(live, i);
    return {
      step: i + 1,
      cpLabel: stageLabel,
      plainTitle: meta.plainTitle,
      simple: meta.simple,
      badge: live?.badge || 'CALCULATING…',
      metric: display.metric || (loading ? 'Calculating…' : 'Run analysis'),
      context: display.context || meta.contextFallback,
      method: meta.method,
      howToRead: meta.howToRead,
      explanation: live?.explanation || 'Live physics + market + simulation value. Auto-calculates on load.',
      live: !!live,
    };
  });

  const openCustomAnalysis = () => { setActiveTab(1); setShowModal(true); };
  const openIncident = (incident) => { setActiveIncident(incident); setActiveTab(4); };

  return (
    <div className="flex h-screen bg-[#f5f8fc] overflow-hidden text-[#10254d]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ═══════════════════ SIDEBAR ═══════════════════ */}
      <aside className="w-60 flex-shrink-0 flex flex-col bg-[#071f3b] overflow-hidden relative">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 pt-6 pb-5 border-b border-white/10 relative z-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Anchor className="w-9 h-9 text-white" />
          </div>
          <div>
            <div className="text-white font-extrabold text-lg leading-tight">Naavai AI</div>
            <div className="text-blue-100/70 text-xs leading-tight">The Freight Strategist</div>
          </div>
        </div>

        {/* Nav items - strictly functional tabs only */}
        <nav className="relative z-10 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ icon: Icon, label, tab }) => {
            const active = activeTab === tab;
            return (
              <button
                key={label}
                onClick={() => setActiveTab(tab)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all text-left ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-blue-100/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-4.5 w-4.5 flex-shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto min-h-[300px] relative bg-cover bg-center" style={{ backgroundImage: "linear-gradient(180deg,rgba(7,31,59,.05),rgba(7,31,59,.12)),url('/sidebar_port.jpg')" }}>
          <div className="absolute inset-x-0 bottom-0 p-6 text-white bg-gradient-to-t from-[#071f3b] via-[#071f3b]/70 to-transparent">
            <p className="text-xl font-bold leading-6">Smarter Freight Decisions for a Stronger Tomorrow</p>
            <span className="mt-4 block h-1.5 w-16 rounded-full bg-sky-400" />
          </div>
        </div>
      </aside>

      {/* ═══════════════════ MAIN ═══════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top Nav Bar - actions only (nav lives in left sidebar to avoid duplication) */}
        <header className="bg-white/95 border-b border-slate-200 flex items-center justify-between px-6 h-[68px] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-slate-800">{TAB_LABELS[activeTab]}</span>
            <span className="hidden sm:inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">TSD</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={openCustomAnalysis}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition"
            >
              <Package className="h-3.5 w-3.5" /> New cargo plan
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="w-9 h-9 bg-[#0c2348] rounded-full flex items-center justify-center text-xs font-bold text-white">TS</div>
              <span className="hidden sm:block text-xs font-semibold leading-4 text-slate-700">TSC Officer<small className="block font-normal text-slate-500">SAIL · TSC Department</small></span>
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto">

          {/* ═══ TAB 0: DASHBOARD ═══ */}
          {activeTab === 0 && (
            <div className="min-h-full p-5 md:p-8 lg:p-10 space-y-7">
              <section className="relative min-h-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-cover bg-center flex items-center" style={{ backgroundImage: "linear-gradient(90deg,rgba(248,251,255,.98) 0%,rgba(248,251,255,.92) 42%,rgba(248,251,255,.08) 78%),url('/ship_hero.jpg')" }}>
                <div className="max-w-2xl px-7 py-9 md:px-10"><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-700">Data-driven freight strategy</p><h1 className="mt-4 text-4xl md:text-5xl font-black leading-[1.05] text-[#0b1c3c]">Plan Today.<br/><span className="text-blue-600">Avoid Tomorrow’s Loss.</span></h1><p className="mt-4 max-w-xl text-base leading-7 text-slate-600">Forecast freight rates, plan vessel chartering and understand port risks for bulk cargo moving to India’s East Coast.</p></div>
              </section>
              <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Start here</p><h2 className="mt-1 text-2xl font-extrabold text-[#10254d]">What do you want to analyze?</h2></div>{result && <button onClick={() => setActiveTab(1)} className="text-sm font-bold text-blue-700 hover:text-blue-900">Open latest analysis →</button>}</div>
              <div className="grid grid-cols-1 xl:grid-cols-[.9fr_1.1fr] gap-5">
                <section className="rounded-2xl border border-blue-200 bg-white p-6 md:p-7 flex flex-col min-h-[365px]"><span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">OPTION 1 · CUSTOM ANALYSIS</span><div className="mt-6 flex gap-5 items-start"><div className="hidden sm:flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><FileText className="h-12 w-12"/></div><div><h3 className="text-2xl font-extrabold text-[#10254d]">Enter your input</h3><p className="mt-1 text-lg text-slate-500">Your own shipment data</p><p className="mt-3 text-sm leading-6 text-slate-600">Enter cargo, origin, destination and vessel details to generate a freight forecast and chartering recommendation.</p></div></div><button onClick={openCustomAnalysis} className="mt-auto flex w-full items-center justify-center gap-3 rounded-xl bg-blue-600 px-5 py-4 text-base font-bold text-white transition hover:bg-blue-700">Enter custom input <ArrowRight className="h-5 w-5"/></button></section>
                <section className="rounded-2xl border border-teal-200 bg-white p-6 md:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><span className="w-fit rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">OPTION 2 · HISTORICAL REPLAY</span><button onClick={() => setActiveTab(4)} className="text-sm font-bold text-blue-700 hover:text-blue-900">Explore all cases →</button></div><div className="mt-5 flex gap-4 items-start"><div className="hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><History className="h-9 w-9"/></div><div><h3 className="text-2xl font-extrabold text-[#10254d]">Replay a past crisis</h3><p className="text-slate-500">See how Naavai would analyze it</p><p className="mt-2 text-sm leading-5 text-slate-600">Explore report-backed SAIL cases and compare the documented exposure with a simulated engine replay.</p></div></div><div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">{incidents.slice(0,3).map((incident,index)=><button key={incident.id} onClick={()=>openIncident(incident)} className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-blue-400 hover:bg-blue-50/40"><img src={`/test_ship_${index+1}.jpg`} alt="Bulk carrier at sea" className="h-20 w-full object-cover"/><span className="block px-3 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Case {index+1}</span><span className="block px-3 pb-3 pt-1 text-sm font-bold leading-5 text-[#10254d]">{incident.title}</span></button>)}{!incidents.length&&<p className="col-span-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Historical cases are unavailable. Check that the API is running.</p>}</div></section>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 border-t border-slate-200 pt-6">{[['Lower freight cost','Compare chartering decisions',BarChart3],['Mitigate market risk','Forecast with uncertainty ranges',ShieldCheck],['Smarter procurement','Match vessel, route and cargo',Ship],['Stronger supply chains','Plan for India’s East Coast',Globe]].map(([title,sub,Icon])=><div key={title} className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-6 w-6"/></span><span><strong className="block text-sm text-[#10254d]">{title}</strong><small className="text-xs text-slate-500">{sub}</small></span></div>)}</div>
            </div>
          )}

          {activeTab === 1 && (
            <div className="px-6 py-5 space-y-5">

              <div className="rounded-2xl bg-slate-900 text-white border border-slate-700 p-6 shadow-xl">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-widest text-emerald-300">Live decision summary · Currency: USD / INR</span>
                    <h1 className="text-3xl font-black mt-2 leading-tight">{f5?.coa_recommended ? 'Book a COA tranche' : 'Book a spot fixture'} for {Number(form.tonnage).toLocaleString()} MT</h1>
                    <p className="text-base text-slate-300 mt-1">{form.origin_port} → {form.destination_port} · {form.vessel_class} · {form.cargo_type}</p>
                  </div>
                  <span className={`px-3 py-1.5 rounded-full text-xs font-black ${clearance && !clearance.allowed ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'}`}>
                    {clearance && !clearance.allowed ? 'BLOCKED' : result ? 'RECOMMENDED' : 'CALCULATING'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                  <div className="rounded-xl bg-white/10 p-3"><span className="text-xs text-slate-400">Estimated savings</span><strong className="block text-xl mt-1">₹{singleSavingsCr} Cr</strong></div>
                  <div className="rounded-xl bg-white/10 p-3"><span className="text-xs text-slate-400">Demurrage risk / exposure</span><strong className="block text-xl mt-1">{l4 ? `${((l4.demurrage_probability || 0) * 100).toFixed(0)}% · $${(l4.demurrage?.demurrage_usd || 0).toLocaleString()}` : '—'}</strong></div>
                  <div className="rounded-xl bg-white/10 p-3"><span className="text-xs text-slate-400">Recommended rate</span><strong className="block text-xl mt-1">{p50 ? `$${p50}/MT` : '—'}</strong></div>
                </div>
                <div className="flex flex-wrap gap-3 mt-5 items-center">
                  <button onClick={() => viewPDF('audit')} disabled={!result || downloading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg">Generate audit PDF</button>
                  <button onClick={() => setShowModal(true)} className="border border-white/30 hover:bg-white/10 text-white font-bold px-4 py-2.5 rounded-lg">Adjust Cargo</button>
                  <button onClick={() => document.getElementById('decision-flow')?.scrollIntoView({ behavior: 'smooth' })} className="text-slate-300 hover:text-white text-sm font-semibold">Why this decision? ↓</button>
                </div>
              </div>

              {result?.route_plan && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Current calculation basis</span>
                      <h2 className="text-sm font-black text-slate-800 mt-1">{result.route_plan.origin} → {result.route_plan.destination}</h2>
                      <p className="text-xs text-slate-500 mt-1">{result.route_plan.route_statement}</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div><span className="text-slate-400 block">Fuel cost</span><strong>${result.route_plan.fuel_cost_usd?.toLocaleString()}</strong></div>
                      <div><span className="text-slate-400 block">OPEX</span><strong>${result.route_plan.voyage_opex_usd?.toLocaleString()}</strong></div>
                      <div><span className="text-slate-400 block">Port cost</span><strong>${result.route_plan.port_cost_usd?.toLocaleString()}</strong></div>
                      <div><span className="text-slate-400 block">Vessel decision</span><strong className={result.layer2_clearance?.allowed ? 'text-emerald-600' : 'text-rose-600'}>{result.vessel_recommendation?.selected}</strong></div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                <span className="text-slate-600">Need context from previous SAIL decisions?</span>
              <button onClick={() => setActiveTab(4)} className="font-bold text-blue-600 hover:text-blue-700">See how Naavai prevented past losses →</button>
              </div>

              {/* ── KPI Cards — live-calculated (no static prefixed values) ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* Admiralty Floor */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-center">
                      <Anchor className="h-5 w-5 text-amber-500" />
                    </div>
                    <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Admiralty Floor</span>
                  </div>
                  <div className="text-3xl font-black text-slate-900 leading-none">
                    {phys ? `$${phys.breakeven_floor_usd_mt}` : <span className="text-lg text-slate-400 animate-pulse">Calculating…</span>}
                    {phys && <span className="text-sm font-normal text-slate-400 ml-1">/MT</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-2">
                    {phys ? `Commercial: $${phys.commercial_breakeven_floor_usd_mt}/MT` : 'Admiralty boundary · auto-computing'}
                  </div>
                </div>

                {/* AI Rate */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-blue-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-center">
                      <BarChart3 className="h-5 w-5 text-blue-500" />
                    </div>
                    <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">
                      AI Rate (P50) — {f3?.route_key?.split('-')[0] ?? (loading ? '…' : '—')}
                    </span>
                  </div>
                  <div className="text-3xl font-black text-blue-600 leading-none">
                    {f3 ? `$${f3.P50_recommended_rate}` : <span className="text-lg text-slate-400 animate-pulse">Calculating…</span>}
                    {f3 && <span className="text-sm font-normal text-slate-400 ml-1">/MT</span>}
                  </div>
                  <div className={`text-xs mt-2 flex items-center gap-1 font-semibold ${deltaPos ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {deltaPct !== null
                      ? <>{deltaPos ? <TrendingUp className="h-3 w-3"/> : <TrendingDown className="h-3 w-3"/>} {deltaPos ? '+' : ''}{deltaPct}% vs FFA</>
                      : <span className="text-slate-400">vs FFA · awaiting live rate</span>
                    }
                  </div>
                </div>

                {/* P90 Risk */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-rose-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-center">
                      <ShieldCheck className="h-5 w-5 text-rose-500" />
                    </div>
                    <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">P90 Risk Ceiling</span>
                  </div>
                  <div className="text-3xl font-black text-rose-600 leading-none">
                    {f3 ? `$${f3.P90_ceiling}` : <span className="text-lg text-slate-400 animate-pulse">Calculating…</span>}
                    {f3 && <span className="text-sm font-normal text-slate-400 ml-1">/MT</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-2">
                    {f3 ? `P10 Floor: $${f3.P10_floor}/MT` : 'P10–P90 band · auto-computing'}
                  </div>
                </div>

                {/* Parcel Volume */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-emerald-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-center">
                      <Package className="h-5 w-5 text-emerald-500" />
                    </div>
                    <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Parcel Volume</span>
                  </div>
                  <div className="text-3xl font-black text-slate-900 leading-none">
                    {parseInt(form.tonnage).toLocaleString()}
                    <span className="text-sm font-normal text-slate-400 ml-1">MT</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-2">{form.cargo_type}</div>
                </div>
              </div>

              <div className="bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-700 text-white">
                <div className="flex items-center justify-between mb-3">
                  <div><h2 className="text-sm font-black">What-If Scenario Simulator</h2><p className="text-xs text-slate-400">Recalculate the selected cargo under market and queue shocks.</p></div>
                  <div className="flex gap-2">
                    <button onClick={() => setScenarioParams({ bunker_delta: 0, port_queue_surge: 0, baltic_pct_delta: 0 })} className="border border-slate-600 text-slate-300 hover:text-white px-3 py-2 rounded-lg text-xs font-bold">Reset to live values</button>
                    <button onClick={runScenario} disabled={scenarioLoading} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 rounded-lg text-xs font-bold">{scenarioLoading ? 'Calculating…' : 'Apply scenario'}</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {[['bunker_delta','Bunker change ($/MT)',-100,100,10],['port_queue_surge','Queue surge (vessels)',0,10,1],['baltic_pct_delta','Baltic change (%)',-30,30,5]].map(([key,label,min,max,step]) => (
                    <label key={key} className="text-slate-300">{label}: <strong className="text-emerald-300">{scenarioParams[key]}</strong>
                      <input type="range" min={min} max={max} step={step} value={scenarioParams[key]} onChange={e => setScenarioParams(p => ({ ...p, [key]: Number(e.target.value) }))} className="w-full accent-emerald-500 mt-2" />
                    </label>
                  ))}
                </div>
              </div>

              {/* ── 5-Stage Decision Flow Checkpoints (Why this rate?) ── */}
              <div id="decision-flow" className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`flex h-2.5 w-2.5 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                      <h2 className="text-sm font-black text-slate-800 tracking-tight">
                        5-Stage Decision Flow: How AI Reached ${f3?.P50_recommended_rate ?? (loading ? '…' : '—')}/MT
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {loading && !result ? 'Live-calculating physics, clearance, ML rate, congestion & fixture…' : 'Statutory audit trail · All values live-calculated · Follow steps 1 → 5 from top to bottom'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full border border-slate-200">
                      CVC / CAG Statutory Trail
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${result ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      <CheckCircle2 className="h-3 w-3" /> {result ? 'All 5 Checkpoints Live' : 'Auto-calculating…'}
                    </span>
                  </div>
                </div>

                {/* CP vertical timeline: CP 1 ↓ CP 2 ↓ CP 3 ↓ CP 4 ↓ CP 5 */}
                <div className="flex flex-col gap-0">
                  {checkpointsList.map((cp, idx) => (
                    <div key={cp.step} className="flex gap-4">
                      {/* Left rail: number + connecting line */}
                      <div className="flex flex-col items-center flex-shrink-0">
                        <span className={`w-9 h-9 rounded-full text-white text-sm font-extrabold flex items-center justify-center shadow ${cp.live ? 'bg-slate-900' : 'bg-amber-500 animate-pulse'}`}>
                          {cp.step}
                        </span>
                        {idx < checkpointsList.length - 1 && (
                          <span className="w-0.5 flex-1 min-h-[28px] bg-slate-200 my-1" />
                        )}
                      </div>

                      {/* Card */}
                      <div className={`flex-1 rounded-xl p-5 border mb-4 transition-all ${cp.live ? 'bg-slate-50 border-slate-200 hover:bg-white hover:shadow-md' : 'bg-amber-50/50 border-amber-200 border-dashed'}`}>
                        {/* Step header */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-xs font-extrabold uppercase tracking-wide bg-slate-900 text-white px-2.5 py-1 rounded-md">
                            {cp.cpLabel}
                          </span>
                          <span className="text-sm font-bold text-slate-800">
                            {cp.plainTitle}
                          </span>
                          <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded tracking-wide ${
                            cp.badge.includes('FAILED') || cp.badge.includes('RESTRICTED')
                              ? 'bg-rose-100 text-rose-700'
                              : cp.badge.includes('LOWER') || cp.badge.includes('BOUND')
                              ? 'bg-amber-100 text-amber-800'
                              : cp.badge.includes('EQUILIBRIUM') || cp.badge.includes('TARGET')
                              ? 'bg-blue-100 text-blue-800'
                              : cp.badge.includes('CALCULATING')
                              ? 'bg-amber-100 text-amber-700 animate-pulse'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {cp.badge}
                          </span>
                        </div>

                        {/* Live value — big and clear */}
                        <div className="text-xl font-extrabold text-slate-900 leading-snug">
                          {cp.metric}
                        </div>
                        <div className="text-sm text-slate-700 font-semibold mt-1">
                          {cp.context}
                        </div>

                        {/* Simple meaning — plain English */}
                        <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5">
                          <p className="text-sm text-slate-800 leading-relaxed">
                            <span className="font-bold">In simple words: </span>{cp.simple}
                          </p>
                        </div>

                        {/* Technical detail — readable font */}
                        <p className="text-sm text-slate-700 leading-relaxed mt-3">
                          <span className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1">What the system checked</span>
                          {cp.explanation}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2.5">
                          <span className="text-sm text-slate-700 bg-white border border-slate-200 rounded-md px-3 py-2">
                            <strong>Method:</strong> {cp.method}
                          </span>
                        </div>
                        <p className="text-sm text-blue-800 font-semibold mt-2">
                          <span className="block text-[11px] font-extrabold uppercase tracking-wide text-blue-600 mb-0.5">Decision / next action</span>
                          → {cp.howToRead}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 ml-1 text-slate-400">
                    <ArrowDown className="h-4 w-4 ml-2.5" />
                    <span className="text-xs font-semibold">End of audit trail — values above are live-calculated</span>
                  </div>
                </div>
              </div>

              {/* ── Chart + Port Anchorage ── */}
              <div className="grid grid-cols-3 gap-4">

                {/* Chart card (2/3 width) */}
                <div className="col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  {/* Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div>
                      <h2 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                        <span className="text-red-500">📈</span>
                        {chartView === 'rates' ? 'Freight rates · history + AI forecast' : 'Market drivers · Singapore bunker + FFA'}
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">90-day observations · route {result?.layer3_ml_forecast?.route_key || 'loading'} · rate values in USD/MT</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
                        {[['rates','Freight rate'],['drivers','Market drivers']].map(([key,label]) => <button key={key} onClick={() => setChartView(key)} className={`px-3 py-1.5 rounded-md text-xs font-bold ${chartView === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>)}
                      </div>
                      {chartView === 'rates' && <div className="flex items-center gap-3 text-xs text-slate-600">
                        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-red-400" />Spot</span>
                        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-slate-400" />FFA</span>
                        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-blue-500" />AI P50</span>
                        <span className="flex items-center gap-1.5"><span className="w-4 h-2 bg-blue-100 border border-blue-200" />P10–P90</span>
                      </div>}
                      {chartView === 'drivers' && <div className="flex items-center gap-3 text-xs text-slate-600">
                        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-amber-500" />Singapore VLSFO ($/MT)</span>
                        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-slate-400" />FFA ($/MT)</span>
                      </div>}
                      {chartView === 'rates' && <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
                        {HORIZONS.map(h => (
                          <button key={h} onClick={() => setActiveHorizon(h)}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                              activeHorizon === h ? 'bg-red-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}>
                            {h}
                          </button>
                        ))}
                      </div>}
                    </div>
                  </div>

                  {/* Recharts line chart */}
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={history} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <XAxis dataKey="date"
                        tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false}
                        interval={Math.max(1, Math.floor(history.length / 7))} />
                      <YAxis yAxisId="rate" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={v => `$${Number(v).toFixed(0)}`} width={58} />
                      {chartView === 'drivers' && <YAxis yAxisId="bunker" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={v => `$${Number(v).toFixed(0)}`} width={58} />}
                      <Tooltip content={<ChartTooltip />} />
                      {chartView === 'rates' ? <>
                        <Area yAxisId="rate" dataKey="P90" stroke="none" fill="#dbeafe" fillOpacity={0.8} name="P10–P90 range" connectNulls />
                        <Area yAxisId="rate" dataKey="P10" stroke="none" fill="#fff" fillOpacity={1} name="P10 baseline" connectNulls />
                        <Line yAxisId="rate" dataKey="spot" stroke="#ef4444" strokeWidth={2} dot={false} name="Spot history" />
                        <Line yAxisId="rate" dataKey="ffa" stroke="#64748b" strokeWidth={1.5} dot={false} name="FFA 30-day" strokeDasharray="5 4" />
                        <Line yAxisId="rate" dataKey="P50" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb' }} activeDot={{ r: 6 }} name="AI predicted freight rate (P50)" connectNulls />
                      </> : <>
                        <Line yAxisId="bunker" dataKey="bunker" stroke="#d97706" strokeWidth={2.5} dot={false} name="Singapore VLSFO ($/MT)" />
                        <Line yAxisId="rate" dataKey="ffa" stroke="#64748b" strokeWidth={2} dot={false} name="FFA 30-day ($/MT)" strokeDasharray="5 4" />
                      </>}
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 mt-2 text-xs text-slate-600 leading-relaxed">
                    {chartView === 'rates' ? <>The blue line is the model’s <strong>predicted freight rate (P50)</strong>; its shaded band shows P10–P90 uncertainty. Red is observed route spot and dashed grey is the 30-day FFA benchmark. Forecast points are shown at +7, +14, +30 and +60 days. <strong>Velocity Index is not currently supplied by the data/API</strong>, so it is not plotted.</> : <>Singapore VLSFO and FFA are shown on separate vertical scales because bunker is quoted in $/MT while its magnitude differs from FFA. The latest model inputs are VLSFO ${Number(form.current_vlsfo_bunker).toLocaleString()}/MT, Baltic P3A ${Number(form.current_baltic_p3a).toLocaleString()}/day and FFA ${Number(form.current_ffa_30d).toFixed(2)}/MT. Historical Baltic/Velocity Index series are not currently exposed by the history API.</>}
                  </div>

                  {/* Horizon forecast summary cards */}
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100">
                    {horizonCards.map(h => (
                      <div key={h.label}
                        onClick={() => setActiveHorizon(h.label)}
                        className={`rounded-xl p-3 text-center cursor-pointer transition-all border-2 ${
                          activeHorizon === h.label
                            ? 'border-red-500 bg-red-50'
                            : 'border-transparent bg-slate-50 hover:bg-slate-100'
                        }`}>
                        <div className="text-[11px] text-slate-500 font-semibold">{h.label}</div>
                        <div className={`text-xl font-black mt-1 ${activeHorizon === h.label ? 'text-red-600' : 'text-slate-800'}`}>
                          {h.p50}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{h.range}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Port Anchorage (1/3) */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-slate-800 text-sm">Technical Evidence · Port Anchorage Simulation</h2>
                    <button className="text-xs text-red-500 font-bold flex items-center gap-1 hover:underline"
                      onClick={() => setActiveTab(3)}>
                      View All <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {congestionRows.map(([port, c]) => (
                      <div key={port}
                        onClick={() => setActiveTab(3)}
                        className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-all cursor-pointer border border-slate-100">
                        <img
                          src={PORT_PHOTOS[port] || '/port_paradip.jpg'}
                          alt={port}
                          className="w-16 h-11 object-cover rounded-lg flex-shrink-0 bg-slate-200"
                          onError={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.display = 'none'; }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-800 text-sm">{port}</div>
                          <div className={`text-xs font-semibold mt-0.5 ${
                            c.Wq_days > 4 ? 'text-rose-500' : c.Wq_days > 2 ? 'text-amber-500' : 'text-emerald-500'
                          }`}>
                            {c.queue} ships · Wq {c.Wq_days}d
                          </div>
                        </div>
                        {c.rho != null && (
                          <div className="text-right flex-shrink-0">
                            <div className="text-[9px] text-slate-400 font-mono uppercase">ρ</div>
                            <div className={`text-sm font-black ${c.rho > 1 ? 'text-rose-500' : 'text-emerald-600'}`}>
                              {c.rho}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Waterfall + TSD Recommendation ── */}
              <div className="grid grid-cols-2 gap-4">

                {/* SHAP Waterfall */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="font-bold text-slate-800 text-[15px] mb-1 flex items-center gap-2">
                    What is driving the price?
                  </h2>
                  <p className="text-sm text-slate-500 mb-4">Bars show how much each factor pushes the rate up or down.</p>

                  {shapRows.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={shapRows.map(([k, v]) => ({ name: k, value: v }))}
                        layout="vertical" margin={{ top: 0, right: 30, left: 55, bottom: 0 }}>
                        <XAxis type="number"
                          tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name"
                          tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} width={60} />
                        <Tooltip
                          contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }}
                          formatter={v => [`$${v.toFixed(3)}/MT`]} />
                        <ReferenceLine x={0} stroke="#e2e8f0" strokeWidth={1.5} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
                          {shapRows.map(([, v], i) => (
                            <Cell key={i} fill={v >= 0 ? '#f87171' : '#34d399'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-44 flex flex-col items-center justify-center text-slate-300">
                      <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
                      <span className="text-sm">Run analysis to see SHAP decomposition</span>
                    </div>
                  )}

                  {f3?.shap_audit?.base_rate_usd_mt && (
                    <p className="text-[10px] text-slate-400 mt-2">
                      Base model rate: ${f3.shap_audit.base_rate_usd_mt}/MT · Sum of bars = model adjustment; physics floor may raise the final P50.
                    </p>
                  )}
                </div>

                {/* TSD Procurement Recommendation */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
                  <h2 className="font-bold text-slate-800 text-[15px] mb-4 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                    TSD Strategic Procurement Recommendation
                  </h2>

                  {f5 ? (
                    <ul className="space-y-3 flex-1 text-[13px] text-slate-600">
                      <li className="flex gap-2.5 items-start">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                        <span><strong className="text-slate-800">Timing Strategy:</strong> {f5.timing_advice}</span>
                      </li>
                      <li className="flex gap-2.5 items-start">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                        <span><strong className="text-slate-800">Contract Mode:</strong> {f5.contract_mode}</span>
                      </li>
                      {l4 && (
                        <li className="flex gap-2.5 items-start">
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-1.5 flex-shrink-0" />
                          <span>
                            <strong className="text-slate-800">Demurrage:</strong> ${(l4.demurrage?.demurrage_usd || 0).toLocaleString()} exposure ·
                            Queue: {(l4.simulated_avg_wait_days || 0).toFixed(2)}d avg ·
                            P90: {(l4.simulated_p90_wait_days || 0).toFixed(2)}d ·
                            Risk: {((l4.demurrage_probability || 0) * 100).toFixed(0)}%
                          </span>
                        </li>
                      )}
                      {f5.contract_strategy && (
                        <li className="flex gap-2.5 items-start">
                          <span className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-1.5 flex-shrink-0" />
                          <span><strong className="text-slate-800">Booking Strategy:</strong> {f5.contract_strategy}</span>
                        </li>
                      )}
                      {l4?.mitigation_plan && (
                        <li className="flex gap-2.5 items-start">
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-1.5 flex-shrink-0" />
                          <span><strong className="text-slate-800">Port Action:</strong> {l4.mitigation_plan}</span>
                        </li>
                      )}
                      {f5.allocation_plan && (
                        <li className="flex gap-2.5 items-start">
                          <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full mt-1.5 flex-shrink-0" />
                          <span><strong className="text-slate-800">Vessel Allocation:</strong> {f5.allocation_plan.instruction}</span>
                        </li>
                      )}
                      {f5.portfolio_optimization && (
                        <li className="flex gap-2.5 items-start">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 flex-shrink-0" />
                          <span>
                            <strong className="text-slate-800">Portfolio Savings:</strong> ₹{f5.portfolio_optimization.portfolio_savings_inr_cr} Cr
                            on 10 cargoes (Spot→COA)
                          </span>
                        </li>
                      )}
                      {result?.historical_incident_context && (
                        <li className="flex gap-2.5 items-start bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                          <span className="text-amber-500 text-sm flex-shrink-0">⏮</span>
                          <span className="text-xs">
                            <strong>Incident Replay:</strong> {result.historical_incident_context.title}<br />
                            Historical case figure: <span className="text-rose-600 font-bold">{result.historical_incident_context.financial_loss}</span>
                          </span>
                        </li>
                      )}
                    </ul>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 py-4">
                      <Target className="h-10 w-10 mb-2 opacity-30" />
                      <span className="text-sm">Click "Plan New Cargo" to run analysis</span>
                    </div>
                  )}

                  {/* 4 action buttons — each does something distinct */}
                  <div className="grid grid-cols-2 gap-2.5 mt-5 pt-4 border-t border-slate-100">
                    {/* Opens Audit PDF in browser → Ctrl+P to print */}
                    <button onClick={() => viewPDF('audit')} disabled={downloading}
                      className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2.5 px-3 rounded-lg transition-all disabled:opacity-50">
                      <Printer className="h-3.5 w-3.5" /> View &amp; Print Audit PDF
                    </button>
                    {/* Opens Broker PDF in browser → Ctrl+P to print */}
                    <button onClick={() => viewPDF('broker')} disabled={downloading}
                      className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-3 rounded-lg transition-all disabled:opacity-50">
                      <Printer className="h-3.5 w-3.5" /> View &amp; Print Broker PDF
                    </button>
                    {/* Saves Broker PDF file to Downloads folder */}
                    <button onClick={() => downloadPDF('broker')} disabled={downloading}
                      className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 px-3 rounded-lg transition-all disabled:opacity-50">
                      <Download className="h-3.5 w-3.5" /> Download Broker PDF
                    </button>
                    {/* Saves Audit PDF file to Downloads folder */}
                    <button onClick={() => downloadPDF('audit')} disabled={downloading}
                      className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2.5 px-3 rounded-lg transition-all disabled:opacity-50">
                      <Download className="h-3.5 w-3.5" /> Download Audit PDF
                    </button>
                    <button onClick={downloadExcel} disabled={downloading}
                      className="col-span-2 flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold py-2.5 px-3 rounded-lg transition-all disabled:opacity-50">
                      <Download className="h-3.5 w-3.5" /> Download Audit Excel + SHA-256 Seal
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ═══ TAB 1: PORTFOLIO / PROCUREMENT ═══ */}
          {activeTab === 2 && (
            <div className="p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">6-Month SAIL CIG Indent Program — MILP Optimization</h2>
                  <p className="text-sm text-slate-500 mt-1">OR-Tools SCIP Solver · Spot vs. COA Multi-Cargo Allocation · Safety Stock + Port Capacity Constraints</p>
                </div>
                {f5?.portfolio_optimization && (
                  <div className="bg-white rounded-xl px-5 py-3 shadow-sm border border-slate-200 text-right flex-shrink-0">
                    <div className="text-xs text-slate-400">Portfolio Savings</div>
                    <div className="text-2xl font-black text-emerald-500">₹{f5.portfolio_optimization.portfolio_savings_inr_cr} Cr</div>
                  </div>
                )}
              </div>

              {assigns.length > 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 text-xs uppercase bg-slate-50 border-b border-slate-200">
                        {['Month','Port','Cargo','MT','Vessel','Mode','Rate $/MT','Cost $M','Demurrage Risk'].map(h => (
                          <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {assigns.map((a, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-700">{a.month}</td>
                          <td className="px-4 py-3 text-slate-600">{a.port}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-[140px] truncate">{a.cargo_type}</td>
                          <td className="px-4 py-3 text-slate-600">{a.tonnage_mt?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-slate-600">{a.vessel_class}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${a.mode === 'COA' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                              {a.mode}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-800">${a.rate_usd_mt}</td>
                          <td className="px-4 py-3 text-slate-600">${((a.total_cost_usd || 0) / 1e6).toFixed(2)}M</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold ${(a.demurrage_risk_usd || 0) > 50000 ? 'text-rose-500' : 'text-emerald-500'}`}>
                              ${((a.demurrage_risk_usd || 0) / 1000).toFixed(0)}K
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-72 flex flex-col items-center justify-center text-slate-300">
                  <Layers className="h-12 w-12 mb-3 opacity-25" />
                  <p className="font-semibold text-slate-500">No schedule yet — run an analysis first</p>
                  <button onClick={() => { setActiveTab(1); setShowModal(true); }}
                    className="mt-3 text-sm text-red-600 font-bold hover:underline flex items-center gap-1">
                    Go to Dashboard <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ═══ TAB 2: AIS MAP ═══ */}
          {activeTab === 3 && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Live AIS Vessel Tracking — East Coast India</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Geofenced anchorage zones · Paradip · Vizag · Haldia · Dhamra</p>
                </div>
                <button
                  onClick={() => axios.get(`${API}/live-ais-tracking`)
                    .then(r => { setAisVessels(r.data.vessels || []); if (r.data.anchorages) setAnchorages(r.data.anchorages); })
                    .catch(err => toast(`AIS refresh failed: ${requestError(err)}`, 'error'))}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all">
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh AIS Feed
                </button>
              </div>
              <div className="rounded-xl overflow-hidden shadow-sm border border-slate-200">
                <AisLiveMap vessels={aisVessels} anchorages={anchorages} />
              </div>
            </div>
          )}

          {activeTab === 4 && (
            <div className="p-6 space-y-5">
              <div className="rounded-2xl bg-slate-900 text-white p-6 shadow-xl">
                <span className="text-xs font-bold uppercase tracking-widest text-amber-300">Case Studies · PS26006</span>
                <h1 className="text-2xl font-black mt-2">How Naavai AI: The Freight Strategist prevents past losses</h1>
                <p className="text-sm text-slate-300 mt-2 max-w-3xl">Replay report-backed procurement, demurrage and draft cases. Each replay runs the five-stage decision engine on the case inputs; reported exposure and simulated estimates are shown separately.</p>
                <button onClick={openCustomAnalysis} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-lg">Analyze a new shipment</button>
              </div>
              <HistoricalIncidentReplay onReplayIncident={handleReplay} onOpenAudit={() => { setActiveTab(1); viewPDF('audit'); }} activeIncidentId={activeIncident?.id} simulationResult={result} />
            </div>
          )}

          {activeTab === 5 && (
            <div className="p-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-4xl">
                <h1 className="text-2xl font-black text-slate-900">Glossary / Help</h1>
                <p className="text-sm text-slate-500 mt-1">Plain-language definitions for the terms used in the freight decision.</p>
                <div className="grid sm:grid-cols-2 gap-3 mt-5">
                  {[['P10 / P50 / P90','Best case, expected case and high-risk forecast prices.'],['VLSFO','Very Low Sulphur Fuel Oil used by the vessel.'],['Baltic P3A','Daily Pacific round voyage freight benchmark.'],['FFA','Forward Freight Agreement market benchmark.'],['UKC','Safe water depth below the vessel keel.'],['Demurrage','Daily charge when port waiting exceeds agreed time.'],['COA','Contract of Affreightment for multiple voyages.'],['SHAP','Explanation of how each model input moves the price.']].map(([term,desc]) => <div key={term} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><strong className="text-slate-900">{term}</strong><p className="text-sm text-slate-600 mt-1">{desc}</p></div>)}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ══════════════ CARGO INPUT MODAL ══════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                  <Anchor className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-800">New Cargo Indent</h2>
                  <p className="text-xs text-slate-400">CIG Procurement Parameters</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {[
                { label: 'Cargo Type', key: 'cargo_type', type: 'select',
                  opts: ['Prime Hard Coking Coal','Semi Hard Coking Coal','PCI Coal','Thermal Coal'] },
                { label: 'Parcel Volume (MT)', key: 'tonnage', type: 'number' },
                { label: 'Origin Port', key: 'origin_port', type: 'select',
                  opts: ['Gladstone','Hay Point','Newcastle','Newport News','Mobile','Maputo','Richards Bay','Samarinda','Muara Pantai'] },
                { label: 'Discharge Port (East Coast India)', key: 'destination_port', type: 'select',
                  opts: ['Paradip','Visakhapatnam','Haldia','Dhamra','Gangavaram'] },
                { label: 'Vessel Class', key: 'vessel_class', type: 'select',
                  opts: ['Capesize','Kamsarmax','Panamax','Supramax'] },
                { label: 'VLSFO Bunker Price ($/MT)', key: 'current_vlsfo_bunker', type: 'number' },
                { label: 'Baltic P3A Rate ($/day)', key: 'current_baltic_p3a', type: 'number' },
                { label: 'FFA 30-Day Paper Curve ($/MT)', key: 'current_ffa_30d', type: 'number' },
              ].map(({ label, key, type, opts }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
                  {type === 'select' ? (
                    <select value={form[key]} onChange={e => setF(key, e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent">
                      {opts.map(o => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type="number" value={form[key]} onChange={e => setF(key, e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent" />
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button onClick={() => setShowModal(false)}
                className="flex-1 border border-slate-200 text-slate-600 font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition text-sm">
                Cancel
              </button>
              <button onClick={() => runAnalysis()} disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-sm shadow-lg shadow-red-200">
                {loading
                  ? <><Activity className="h-4 w-4 animate-pulse" /> Analysing all layers…</>
                  : <><Target className="h-4 w-4" /> Execute Intelligent Forecast</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
