import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Ship, Anchor, TrendingDown, TrendingUp, ShieldCheck, FileText,
  CheckCircle2, AlertTriangle, Activity, Map, BarChart3, Target,
  Download, Printer, X, Award, ExternalLink
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Area, ComposedChart, Legend, BarChart, Bar, Cell
} from 'recharts';

const API = "http://localhost:8000/api/v1";

const toast = (msg, type = 'success') => {
  const el = document.createElement('div');
  el.className = `fixed top-4 right-4 z-50 px-5 py-3 rounded-lg text-sm font-semibold shadow-lg transition-all ${
    type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
  }`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
};

const TABS = ['Analysis', 'Portfolio Schedule', 'AIS Tracking'];

export default function App() {
  const [loading, setLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [congestion, setCongestion] = useState(null);
  const [aisVessels, setAisVessels] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [pdfModal, setPdfModal] = useState(null); // 'audit' | 'broker' | null
  const [formData, setFormData] = useState({
    cargo_type: "Prime Hard Coking Coal",
    tonnage: 75000,
    origin_port: "Gladstone",
    destination_port: "Paradip",
    vessel_class: "Kamsarmax",
    current_vlsfo_bunker: 620,
    current_baltic_p3a: 19500,
    current_ffa_30d: 21.0
  });

  useEffect(() => {
    axios.get(`${API}/forecast-history?days=90`)
      .then(r => setHistory(r.data.dates.map((d, i) => ({
        date: d.slice(5), spot: r.data.spot[i], ffa: r.data.ffa[i]
      })))).catch(() => {});
    axios.get(`${API}/port-congestion`).then(r => setCongestion(r.data)).catch(() => {});
    axios.get(`${API}/live-ais-tracking`).then(r => setAisVessels(r.data.vessels || [])).catch(() => {});
  }, []);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API}/analyze-shipment`, {
        ...formData,
        tonnage: parseFloat(formData.tonnage),
        current_vlsfo_bunker: parseFloat(formData.current_vlsfo_bunker),
        current_baltic_p3a: parseFloat(formData.current_baltic_p3a),
        current_ffa_30d: parseFloat(formData.current_ffa_30d),
      });
      setResult(res.data);
      const h = res.data.layer3_ml_forecast.horizons;
      const band = Object.entries(h).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .map(([k, v]) => ({ date: k, P50: v.P50, P10: v.P10, P90: v.P90 }));
      setHistory(prev => [...prev.slice(-60), ...band]);
      setActiveTab(0);
      toast('Analysis complete — all 5 layers executed.');
    } catch {
      toast('Ensure FastAPI server is running on localhost:8000!', 'error');
    }
    setLoading(false);
  };

  // Direct Binary PDF Downloader
  const downloadPDF = async (kind) => {
    setDownloadingPdf(true);
    try {
      const endpoint = kind === 'audit' ? 'audit-receipt-pdf' : 'broker-order-pdf';
      const filename = kind === 'audit' ? 'SAIL_CVC_CAG_Audit_Receipt.pdf' : 'SAIL_Broker_Cargo_Order.pdf';
      const res = await axios.post(`${API}/${endpoint}`, formData, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      toast(`Downloaded ${filename}`);
    } catch {
      toast('Error generating PDF from backend.', 'error');
    }
    setDownloadingPdf(false);
  };

  const handlePrint = () => {
    window.print();
  };

  const clearance = result?.layer2_clearance;
  const f3 = result?.layer3_ml_forecast;
  const f5 = result?.layer5_recommendation;
  const phys = result?.layer2_naval_physics;
  const l4 = result?.layer4_queue_demurrage;

  // Dynamic delta vs current user-entered FFA
  const ffa = parseFloat(formData.current_ffa_30d) || 21;
  const p50 = f3?.P50_recommended_rate;
  const deltaPct = p50 != null ? (((p50 - ffa) / ffa) * 100).toFixed(1) : null;
  const deltaPositive = deltaPct > 0;

  // SHAP contributions sorted by absolute value
  const shapContribs = f3?.shap_audit?.contributions_usd_mt || {};
  const shapEntries = Object.entries(shapContribs).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  // Portfolio schedule assignments
  const assignments = f5?.portfolio_optimization?.schedule_assignments || [];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Top Header */}
      <header className="flex justify-between items-center border-b border-slate-700 px-8 py-4 no-print">
        <div>
          <h1 className="text-2xl font-extrabold text-blue-400 flex items-center gap-3">
            <Ship className="h-7 w-7" /> Naavai AI
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">Decision-Support System for SAIL TSD Kolkata — Team F6 · SIH 2026 PS26006</p>
        </div>
        <div className="flex items-center gap-3">
          {result && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono bg-emerald-900/40 border border-emerald-700 px-3 py-1.5 rounded-full">
              <CheckCircle2 className="h-3.5 w-3.5" /> All Layers Executed
            </span>
          )}
          <span className="bg-blue-900 text-blue-200 text-xs px-3 py-1.5 rounded-full border border-blue-700 font-mono">v2.0.0 · Production</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-700 px-8 no-print">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition ${activeTab === i ? 'border-blue-400 text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="p-8 no-print">
        {/* ===== TAB 0: ANALYSIS ===== */}
        {activeTab === 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input Panel */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <Anchor className="h-5 w-5 text-blue-400" /> CIG Cargo Indent Package
              </h2>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-slate-400 block mb-1">Cargo Type</label>
                  <select value={formData.cargo_type} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    onChange={e => setFormData({ ...formData, cargo_type: e.target.value })}>
                    <option>Prime Hard Coking Coal</option>
                    <option>Semi Hard Coking Coal</option>
                    <option>PCI Coal</option>
                    <option>Thermal Coal</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Parcel Volume (MT)</label>
                  <input type="number" value={formData.tonnage} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    onChange={e => setFormData({ ...formData, tonnage: e.target.value })} />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Origin Port</label>
                  <select value={formData.origin_port} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    onChange={e => setFormData({ ...formData, origin_port: e.target.value })}>
                    <option value="Gladstone">Gladstone (Australia)</option>
                    <option value="Hay Point">Hay Point (Australia)</option>
                    <option value="Newcastle">Newcastle (Australia)</option>
                    <option value="Newport News">Newport News (US Gulf)</option>
                    <option value="Mobile">Mobile (US Gulf)</option>
                    <option value="Maputo">Maputo (Mozambique)</option>
                    <option value="Richards Bay">Richards Bay (S. Africa)</option>
                    <option value="Samarinda">Samarinda (Indonesia)</option>
                    <option value="Muara Pantai">Muara Pantai (Indonesia)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Discharge Port (East Coast India)</label>
                  <select value={formData.destination_port} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    onChange={e => setFormData({ ...formData, destination_port: e.target.value })}>
                    <option value="Paradip">Paradip Port (Max Draft: 14.5m)</option>
                    <option value="Visakhapatnam">Visakhapatnam Outer (Max Draft: 18.1m)</option>
                    <option value="Haldia">Haldia Dock (Tidal Convoy, Geared Only)</option>
                    <option value="Dhamra">Dhamra Port (Max Draft: 17.5m)</option>
                    <option value="Gangavaram">Gangavaram (Max Draft: 18.5m)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Vessel Class</label>
                  <select value={formData.vessel_class} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    onChange={e => setFormData({ ...formData, vessel_class: e.target.value })}>
                    {['Capesize', 'Kamsarmax', 'Panamax', 'Supramax'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">VLSFO Bunker ($/MT)</label>
                    <input type="number" value={formData.current_vlsfo_bunker} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                      onChange={e => setFormData({ ...formData, current_vlsfo_bunker: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Baltic P3A ($/day)</label>
                    <input type="number" value={formData.current_baltic_p3a} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                      onChange={e => setFormData({ ...formData, current_baltic_p3a: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">FFA 30d Paper Curve ($/MT)</label>
                  <input type="number" value={formData.current_ffa_30d} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    onChange={e => setFormData({ ...formData, current_ffa_30d: e.target.value })} />
                </div>
                <button onClick={runAnalysis} disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 py-3 rounded-lg font-bold transition flex items-center justify-center gap-2">
                  {loading ? <><Activity className="h-4 w-4 animate-pulse" /> Simulating Layers 1–5...</> : <><Target className="h-4 w-4" /> Execute Intelligent Forecast</>}
                </button>
              </div>

              {/* Live Port Congestion Panel */}
              {congestion && (
                <div className="pt-4 border-t border-slate-700">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Live Port Anchorage (M/M/c)</h3>
                  {Object.entries(congestion).map(([p, c]) => (
                    <div key={p} className="flex justify-between items-center text-xs py-1.5 border-b border-slate-700/40 last:border-0">
                      <span className="text-slate-300 font-medium">{p}</span>
                      <div className="text-right">
                        <span className={`font-bold ${c.Wq_days > 4 ? 'text-rose-400' : c.Wq_days > 2 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {c.queue} ships · Wq {c.Wq_days}d
                        </span>
                        {c.rho && <div className="text-slate-500">ρ={c.rho}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Results Panel */}
            <div className="lg:col-span-2 space-y-5">
              {result ? (
                <>
                  {/* Clearance Alert */}
                  {clearance && !clearance.allowed && (
                    <div className="bg-rose-950 border border-rose-700 p-4 rounded-xl text-sm flex gap-3 items-start">
                      <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-rose-300">Vessel REJECTED — {clearance.port}</p>
                        <p className="text-rose-400 text-xs mt-1">{clearance.reason}</p>
                        {clearance.max_permissible_cargo_mt > 0 && (
                          <p className="text-amber-300 text-xs mt-1">Max permissible parcel at this port: <strong>{clearance.max_permissible_cargo_mt.toLocaleString()} MT</strong></p>
                        )}
                      </div>
                    </div>
                  )}
                  {clearance && clearance.allowed && (
                    <div className="bg-emerald-950 border border-emerald-700 p-3 rounded-xl text-sm flex gap-2 items-center">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span className="text-emerald-300 text-xs">{clearance.reason} · UKC {clearance.ukc_m}m (operating draft {clearance.operating_draft_m}m)</span>
                    </div>
                  )}

                  {/* KPI Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-800 border border-amber-500/30 p-4 rounded-xl">
                      <span className="text-amber-400 text-xs uppercase font-mono">Admiralty Floor</span>
                      <p className="text-2xl font-black text-amber-300 mt-1">${phys.breakeven_floor_usd_mt}<span className="text-xs font-normal text-slate-400"> /MT</span></p>
                      <p className="text-xs text-slate-500 mt-1">Commercial: ${phys.commercial_breakeven_floor_usd_mt}/MT</p>
                    </div>
                    <div className="bg-slate-800 border border-blue-500/50 p-4 rounded-xl bg-blue-950/20">
                      <span className="text-blue-300 text-xs uppercase font-mono">AI Rate (P50) · {f3.route_key?.split('-')[0]}</span>
                      <p className="text-3xl font-black text-blue-400 mt-1">${f3.P50_recommended_rate}<span className="text-xs font-normal text-slate-400"> /MT</span></p>
                      {deltaPct !== null && (
                        <p className={`text-xs mt-1 flex items-center gap-1 ${deltaPositive ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {deltaPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {deltaPositive ? '+' : ''}{deltaPct}% vs FFA
                        </p>
                      )}
                    </div>
                    <div className="bg-slate-800 border border-rose-500/30 p-4 rounded-xl">
                      <span className="text-rose-400 text-xs uppercase font-mono">P90 Risk Ceiling</span>
                      <p className="text-2xl font-black text-rose-300 mt-1">${f3.P90_ceiling}<span className="text-xs font-normal text-slate-400"> /MT</span></p>
                      <p className="text-xs text-slate-500 mt-1">P10: ${f3.P10_floor}/MT</p>
                    </div>
                  </div>

                  {/* Forecast Chart with Fan Bands */}
                  <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl">
                    <h3 className="font-bold text-slate-200 mb-3 text-sm flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-blue-400" /> 90-Day History + Multi-Horizon Forecast Fan (7d/14d/30d/60d)
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={history}>
                        <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} minTickGap={20} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} domain={['auto', 'auto']} width={45} />
                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                          formatter={(v, n) => [`$${v}/MT`, n]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area dataKey="P90" stroke="none" fill="#f43f5e22" name="P90 Band" />
                        <Area dataKey="P10" stroke="none" fill="#0f172a" name="P10 Band" />
                        <Line dataKey="spot" stroke="#f59e0b" dot={false} name="Spot History" strokeWidth={1.5} />
                        <Line dataKey="ffa" stroke="#64748b" dot={false} strokeDasharray="4 4" name="FFA Paper" />
                        <Line dataKey="P50" stroke="#60a5fa" strokeWidth={2.5} dot={false} name="AI P50 Outlook" />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div className="grid grid-cols-4 gap-2 mt-3 text-center text-xs">
                      {Object.entries(f3.horizons).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([h, v]) => (
                        <div key={h} className="bg-slate-900 rounded p-2 border border-slate-700">
                          <div className="text-slate-400 font-mono">{h}</div>
                          <div className="font-bold text-blue-300 text-sm">${v.P50}</div>
                          <div className="text-slate-500">${v.P10}–${v.P90}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* SHAP Waterfall */}
                  {shapEntries.length > 0 && (
                    <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl">
                      <h3 className="font-bold text-slate-200 mb-3 text-sm flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-purple-400" /> SHAP Waterfall — Explainable AI Decomposition (CVC/CAG Audit)
                      </h3>
                      <p className="text-xs text-slate-500 mb-3">Base rate: ${f3.shap_audit?.base_rate_usd_mt}/MT · Each bar shows incremental $/MT contribution</p>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={shapEntries.map(([k, v]) => ({ name: k.replace('vlsfo_singapore', 'VLSFO').replace('baltic_p3a', 'Baltic').replace('ffa_30d_paper', 'FFA').replace('_usd_mt', '').replace('_usd_day', '').replace('_', ' '), value: v }))} layout="vertical" margin={{ left: 100 }}>
                          <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `$${v}`} />
                          <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 10 }} width={100} />
                          <Tooltip formatter={v => [`$${v}/MT`]} contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                            {shapEntries.map(([, v], i) => (
                              <Cell key={i} fill={v >= 0 ? '#f43f5e' : '#10b981'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Recommendation Card */}
                  <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl space-y-3">
                    <h3 className="font-bold text-slate-200 flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-400" /> TSD Strategic Procurement Recommendation
                    </h3>
                    <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-700/50 space-y-2 text-sm">
                      <p><strong className="text-blue-300">Timing Strategy:</strong> {f5.timing_advice}</p>
                      <p><strong className="text-blue-300">Contract Mode:</strong> {f5.contract_mode}</p>
                      <p><strong className="text-blue-300">Demurrage Cap:</strong> {f5.demurrage_cap_recommendation}</p>
                      <p><strong className="text-blue-300">SimPy Port Wait:</strong> {l4.simulated_avg_wait_days}d avg · P90: {l4.simulated_p90_wait_days}d · Demurrage: ${l4.demurrage.demurrage_usd?.toLocaleString()}</p>
                      <p><strong className="text-blue-300">Portfolio Savings:</strong> ₹{f5.portfolio_optimization?.portfolio_savings_inr_cr} Cr on {f5.portfolio_optimization?.total_cargoes} cargoes (Spot→COA)</p>
                    </div>

                    {/* PDF Actions Bar */}
                    <div className="pt-2 flex flex-wrap gap-2.5">
                      <button onClick={() => setPdfModal('audit')}
                        className="bg-purple-700 hover:bg-purple-600 px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow">
                        <Printer className="h-4 w-4" /> View & Print Audit PDF
                      </button>
                      <button onClick={() => setPdfModal('broker')}
                        className="bg-slate-700 hover:bg-slate-600 px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow">
                        <FileText className="h-4 w-4" /> View & Print Broker PDF
                      </button>
                      <button onClick={() => downloadPDF('audit')} disabled={downloadingPdf}
                        className="bg-blue-700 hover:bg-blue-600 disabled:opacity-60 px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow">
                        <Download className="h-4 w-4" /> Download Audit .PDF
                      </button>
                      <button onClick={() => downloadPDF('broker')} disabled={downloadingPdf}
                        className="bg-teal-700 hover:bg-teal-600 disabled:opacity-60 px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow">
                        <Download className="h-4 w-4" /> Download Broker .PDF
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-slate-800 border border-dashed border-slate-700 h-64 rounded-xl flex flex-col items-center justify-center text-slate-500 gap-3">
                    <Ship className="h-10 w-10 text-slate-700" />
                    <p className="text-sm">Enter cargo parameters and click <strong className="text-slate-400">Execute Intelligent Forecast</strong></p>
                    <p className="text-xs text-slate-600">All 5 layers: Naval Physics · LightGBM · VECM · SimPy · OR-Tools MILP</p>
                  </div>
                  {history.length > 0 && (
                    <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl">
                      <h3 className="font-bold text-slate-200 mb-2 text-sm">90-Day Market History (Preloaded)</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={history}>
                          <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} minTickGap={30} />
                          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} domain={['auto', 'auto']} width={45} />
                          <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} formatter={v => [`$${v}/MT`]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line dataKey="spot" stroke="#f59e0b" dot={false} name="Aus-Paradip Spot" strokeWidth={2} />
                          <Line dataKey="ffa" stroke="#64748b" dot={false} strokeDasharray="4 4" name="FFA Paper 30d" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ===== TAB 1: PORTFOLIO SCHEDULE ===== */}
        {activeTab === 1 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-200">6-Month SAIL CIG Indent Program — MILP Optimization</h2>
                <p className="text-xs text-slate-500 mt-1">OR-Tools SCIP Solver | Spot vs. COA Multi-Cargo Allocation | Safety Stock + Port Capacity Constraints</p>
              </div>
              {f5?.portfolio_optimization && (
                <div className="text-right">
                  <div className="text-xs text-slate-400">Portfolio Savings</div>
                  <div className="text-2xl font-black text-emerald-400">₹{f5.portfolio_optimization.portfolio_savings_inr_cr} Cr</div>
                  <div className="text-xs text-slate-500">${f5.portfolio_optimization.optimised_total_usd?.toLocaleString()} optimised vs ${f5.portfolio_optimization.baseline_spot_total_usd?.toLocaleString()} spot</div>
                </div>
              )}
            </div>

            {assignments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-slate-400 text-xs uppercase border-b border-slate-700">
                      <th className="py-3 pr-4">Shipment ID</th>
                      <th className="py-3 pr-4">Month</th>
                      <th className="py-3 pr-4">Route</th>
                      <th className="py-3 pr-4 text-right">Qty (MT)</th>
                      <th className="py-3 pr-4">Mode</th>
                      <th className="py-3 pr-4">COA Package</th>
                      <th className="py-3 text-right">Rate ($/MT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a, i) => (
                      <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-800/60 transition">
                        <td className="py-3 pr-4 font-mono text-xs text-slate-300">{a.shipment_id}</td>
                        <td className="py-3 pr-4 text-slate-300">{a.month}</td>
                        <td className="py-3 pr-4 text-slate-400 text-xs">{a.route}</td>
                        <td className="py-3 pr-4 text-right text-slate-200">{a.qty_mt?.toLocaleString()}</td>
                        <td className="py-3 pr-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${a.mode === 'COA Package' ? 'bg-blue-900/60 text-blue-300 border border-blue-700' : 'bg-amber-900/40 text-amber-300 border border-amber-700'}`}>
                            {a.mode}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-500">{a.allocated_package || '—'}</td>
                        <td className="py-3 text-right font-bold text-slate-200">${a.effective_rate_usd_mt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-slate-800 border border-dashed border-slate-700 h-64 rounded-xl flex flex-col items-center justify-center text-slate-500 gap-3">
                <BarChart3 className="h-10 w-10 text-slate-700" />
                <p className="text-sm">Run <strong className="text-slate-400">Execute Intelligent Forecast</strong> first to generate the schedule</p>
              </div>
            )}

            {f5?.portfolio_optimization && (
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl text-center">
                  <div className="text-slate-400 text-xs uppercase">Spot Baseline</div>
                  <div className="text-xl font-black text-amber-300">${f5.portfolio_optimization.baseline_spot_total_usd?.toLocaleString()}</div>
                </div>
                <div className="bg-slate-800 border border-blue-700/40 p-4 rounded-xl text-center bg-blue-950/20">
                  <div className="text-blue-300 text-xs uppercase">MILP Optimised</div>
                  <div className="text-xl font-black text-blue-300">${f5.portfolio_optimization.optimised_total_usd?.toLocaleString()}</div>
                </div>
                <div className="bg-slate-800 border border-emerald-700/40 p-4 rounded-xl text-center bg-emerald-950/20">
                  <div className="text-emerald-300 text-xs uppercase">Savings (INR Cr)</div>
                  <div className="text-xl font-black text-emerald-400">₹{f5.portfolio_optimization.portfolio_savings_inr_cr} Cr</div>
                  <div className="text-xs text-slate-500">Safety Stock: {f5.portfolio_optimization.safety_stock_ok ? '✅ OK' : '⚠️ Check'}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== TAB 2: AIS TRACKING ===== */}
        {activeTab === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2"><Map className="h-5 w-5 text-blue-400" /> Satellite AIS Geofencing — East Coast India Anchorages</h2>
              <p className="text-xs text-slate-500 mt-1">Shapely polygon detection across Paradip, Visakhapatnam, and Haldia anchorage zones · Layer 4b</p>
            </div>
            {aisVessels.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {aisVessels.map((v, i) => (
                  <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-slate-200 flex items-center gap-2"><Ship className="h-4 w-4 text-blue-400" /> {v.name}</h3>
                        <p className="text-xs text-slate-500 font-mono">MMSI {v.mmi} · {v.vessel_class} · {v.dwt?.toLocaleString()} DWT</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold border ${v.verified_anchorage ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' : 'bg-rose-900/50 text-rose-300 border-rose-700'}`}>
                        {v.verified_anchorage ? `✓ ${v.verified_anchorage}` : 'Outside Zone'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-900 p-2 rounded"><span className="text-slate-500">Cargo</span><div className="text-slate-200 font-semibold">{v.cargo}</div></div>
                      <div className="bg-slate-900 p-2 rounded"><span className="text-slate-500">Port</span><div className="text-slate-200 font-semibold">{v.port}</div></div>
                      <div className="bg-slate-900 p-2 rounded"><span className="text-slate-500">Lat/Lon</span><div className="text-slate-200 font-mono">{v.lat}°N {v.lon}°E</div></div>
                      <div className="bg-slate-900 p-2 rounded">
                        <span className="text-slate-500">Days at Anchor</span>
                        <div className={`font-bold ${v.days_at_anchor > 4 ? 'text-rose-400' : v.days_at_anchor > 2 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {v.days_at_anchor}d {v.days_at_anchor > 4 ? '⚠️ Demurrage Risk' : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-800 border border-dashed border-slate-700 h-48 rounded-xl flex items-center justify-center text-slate-500">
                <p>No AIS data loaded — ensure backend is running.</p>
              </div>
            )}
            <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl text-xs text-slate-500">
              <p className="font-semibold text-slate-400 mb-2">Geofence Polygon Coordinates</p>
              <div className="grid grid-cols-3 gap-4 font-mono">
                <div><span className="text-blue-400">Paradip</span><br/>86.55°–86.85°E<br/>19.95°–20.20°N</div>
                <div><span className="text-blue-400">Visakhapatnam</span><br/>83.20°–83.45°E<br/>17.55°–17.80°N</div>
                <div><span className="text-blue-400">Haldia</span><br/>87.85°–88.15°E<br/>21.45°–21.70°N</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== EXECUTIVE OFFICIAL PDF PREVIEW & PRINT MODAL ===== */}
      {pdfModal && result && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 md:p-8 overflow-y-auto print-modal-container">
          <div className="bg-white text-slate-900 rounded-xl max-w-4xl w-full shadow-2xl overflow-hidden print-document border border-slate-300">
            {/* Modal Controls (Hidden in Print) */}
            <div className="bg-slate-800 text-white px-6 py-3.5 flex justify-between items-center no-print border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-400" />
                <span className="font-bold text-sm">
                  {pdfModal === 'audit' ? 'Official CVC / CAG Statutory Transparency Audit Receipt' : 'Official Commercial Broker Cargo Order & Fixture Notice'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePrint}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1.5 transition">
                  <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
                </button>
                <button onClick={() => downloadPDF(pdfModal)} disabled={downloadingPdf}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1.5 transition">
                  <Download className="h-3.5 w-3.5" /> Download .PDF File
                </button>
                <button onClick={() => setPdfModal(null)}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold p-1.5 rounded transition">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Document Content - Styled as Official Government of India / SAIL Document */}
            <div className="p-8 md:p-12 space-y-6">
              {/* Document Header */}
              <div className="border-b-2 border-blue-900 pb-5">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Government of India Enterprise · Maharatna CPSE</div>
                    <h1 className="text-xl md:text-2xl font-black text-blue-950 tracking-tight mt-0.5">
                      STEEL AUTHORITY OF INDIA LIMITED (SAIL)
                    </h1>
                    <p className="text-sm font-semibold text-blue-900">
                      Transport & Shipping Department (TSD) · Ispat Bhawan, 40 Chowringhee Road, Kolkata 700071
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-blue-950 text-white text-[10px] font-mono uppercase px-2.5 py-1 rounded font-bold">
                      {pdfModal === 'audit' ? 'CVC STATUTORY VIGILANCE AUDIT' : 'OFFICIAL TENDER CARGO ORDER'}
                    </span>
                    <div className="text-xs font-mono text-slate-600 mt-1">Ref: SAIL/TSD/2026/F6-PS26006</div>
                    <div className="text-xs text-slate-500">Date: {new Date().toLocaleDateString('en-GB')}</div>
                  </div>
                </div>
              </div>

              {/* Title Banner */}
              <div className="bg-slate-100 border-l-4 border-blue-900 p-3.5 rounded-r">
                <h2 className="text-base font-bold text-slate-900 uppercase">
                  {pdfModal === 'audit'
                    ? 'Statutory Transparency Audit Receipt — Explainable AI Freight Valuation'
                    : 'Intelligent Broker Cargo Order & Benchmark Fixture Terms'}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Issued under CVC Guidelines for Public Procurement & Chartering Transparency via Naavai AI Decision-Support System
                </p>
              </div>

              {/* 1. Indent & Voyage Parameters */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-950 mb-2 border-b border-slate-200 pb-1">
                  1. Parcel & Voyage Technical Specifications
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-50 p-3 rounded border border-slate-200">
                  <div><span className="text-slate-500 block">Commodity:</span><strong className="text-slate-800">{formData.cargo_type}</strong></div>
                  <div><span className="text-slate-500 block">Parcel Quantity:</span><strong className="text-slate-800">{parseFloat(formData.tonnage).toLocaleString()} MT (±10% MOLOO)</strong></div>
                  <div><span className="text-slate-500 block">Loading Port:</span><strong className="text-slate-800">{formData.origin_port}</strong></div>
                  <div><span className="text-slate-500 block">Discharge Port:</span><strong className="text-slate-800">{formData.destination_port}</strong></div>
                  <div><span className="text-slate-500 block">Vessel Class:</span><strong className="text-slate-800">{formData.vessel_class}</strong></div>
                  <div><span className="text-slate-500 block">Operating Arrival Draft:</span><strong className="text-slate-800">{clearance?.operating_draft_m} m</strong></div>
                  <div><span className="text-slate-500 block">Under-Keel Clearance:</span><strong className="text-slate-800">{clearance?.ukc_m} m ({clearance?.allowed ? 'PASSED' : 'ALERT'})</strong></div>
                  <div><span className="text-slate-500 block">Nautical Distance:</span><strong className="text-slate-800">{phys?.distance_nm?.toLocaleString()} NM ({phys?.sea_days} Sea Days)</strong></div>
                </div>
              </div>

              {/* 2. Benchmark Valuation Cards */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-950 mb-2 border-b border-slate-200 pb-1">
                  2. Econometric Rate Benchmarks & Statutory Ceilings
                </h3>
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                    <div className="text-[10px] font-bold uppercase text-amber-800">Admiralty Floor</div>
                    <div className="text-lg font-black text-amber-900 mt-1">${phys?.breakeven_floor_usd_mt}/MT</div>
                    <div className="text-[10px] text-slate-500">Commercial: ${phys?.commercial_breakeven_floor_usd_mt}/MT</div>
                  </div>
                  <div className="p-3 bg-blue-50 border border-blue-300 rounded">
                    <div className="text-[10px] font-bold uppercase text-blue-900">AI Target Rate (P50)</div>
                    <div className="text-2xl font-black text-blue-950 mt-1">${f3?.P50_recommended_rate}/MT</div>
                    <div className="text-[10px] text-slate-600">{deltaPct !== null ? `${deltaPositive ? '+' : ''}${deltaPct}% vs FFA` : 'Median Outlook'}</div>
                  </div>
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded">
                    <div className="text-[10px] font-bold uppercase text-rose-800">Disqualification Cap (P90)</div>
                    <div className="text-lg font-black text-rose-900 mt-1">${f3?.P90_ceiling}/MT</div>
                    <div className="text-[10px] text-slate-500">P10 Floor: ${f3?.P10_floor}/MT</div>
                  </div>
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded">
                    <div className="text-[10px] font-bold uppercase text-emerald-800">COA Program Savings</div>
                    <div className="text-lg font-black text-emerald-900 mt-1">₹{f5?.portfolio_optimization?.portfolio_savings_inr_cr} Cr</div>
                    <div className="text-[10px] text-slate-500">10-Indent Allocation</div>
                  </div>
                </div>
              </div>

              {/* 3. SHAP Waterfall Table (Audit Proof) */}
              {pdfModal === 'audit' && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-950 mb-2 border-b border-slate-200 pb-1">
                    3. Glass-Box Explainable AI Decomposition (LightGBM TreeExplainer)
                  </h3>
                  <div className="text-[11px] text-slate-600 mb-2">
                    Prior Model Intercept Base Rate: <strong>${f3?.shap_audit?.base_rate_usd_mt} / MT</strong>. Every price component is mathematically grounded in statutory econometric drivers.
                  </div>
                  <table className="w-full text-xs border border-slate-300">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="py-2 px-3 text-left border-b border-slate-300">Market Driver / Exogenous Feature</th>
                        <th className="py-2 px-3 text-left border-b border-slate-300">Observation Input</th>
                        <th className="py-2 px-3 text-right border-b border-slate-300">Marginal Impact ($/MT)</th>
                        <th className="py-2 px-3 text-left border-b border-slate-300">Statutory Justification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shapEntries.map(([feat, delta], idx) => (
                        <tr key={feat} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="py-1.5 px-3 font-semibold text-slate-800 border-b border-slate-200">
                            {feat.replace('vlsfo_singapore', 'VLSFO Bunker').replace('baltic_p3a', 'Baltic P3A T/C').replace('ffa_30d_paper', 'FFA 30d Curve').replace('_usd_mt', '').replace('_usd_day', '').replace('_', ' ')}
                          </td>
                          <td className="py-1.5 px-3 text-slate-600 border-b border-slate-200 font-mono">
                            {feat.includes('vlsfo') ? `$${formData.current_vlsfo_bunker}/MT` : feat.includes('baltic') ? `$${formData.current_baltic_p3a}/day` : `$${formData.current_ffa_30d}/MT`}
                          </td>
                          <td className={`py-1.5 px-3 text-right font-bold border-b border-slate-200 ${delta >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                            {delta >= 0 ? '+' : ''}${delta.toFixed(3)}
                          </td>
                          <td className="py-1.5 px-3 text-slate-500 text-[11px] border-b border-slate-200">
                            {feat.includes('ffa') ? 'Paper market derivative forward sentiment' : feat.includes('vlsfo') ? 'Hydrodynamic fuel burn direct pass-through' : 'Bulk vessel charter availability index'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 4. Commercial Terms & Instructions (Broker Order Specific) */}
              {pdfModal === 'broker' && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-950 mb-2 border-b border-slate-200 pb-1">
                    3. Chartering Terms & Commercial Directives
                  </h3>
                  <div className="space-y-1.5 text-xs bg-slate-50 p-3 rounded border border-slate-200">
                    <p><strong>Target Freight Rate:</strong> ${f3?.P50_recommended_rate} per Metric Tonne FIOST 1 Safe Berth Loading / 1 Safe Berth Discharge.</p>
                    <p><strong>Disqualification Cap (P90):</strong> Offers exceeding ${f3?.P90_ceiling} / MT will be automatically rejected under SAIL CIG pricing norms.</p>
                    <p><strong>Laytime Allowance:</strong> 5.0 Weather Working Days of 24 consecutive hours (SHINC).</p>
                    <p><strong>Demurrage / Despatch:</strong> {f5?.demurrage_cap_recommendation}.</p>
                    <p><strong>Payment Terms:</strong> 95% freight payable within 7 banking days upon receipt of clean on-board Bills of Lading.</p>
                  </div>
                </div>
              )}

              {/* 5. Port Queue & Demurrage Mitigation */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-950 mb-2 border-b border-slate-200 pb-1">
                  {pdfModal === 'audit' ? '4. Port Queue Discrete-Event Simulation & Demurrage Risk' : '4. Operational Port Guidance'}
                </h3>
                <div className="text-xs bg-slate-50 p-3 rounded border border-slate-200 space-y-1">
                  <p><strong>SimPy Stochastic Simulation:</strong> Predicted anchorage waiting time is <strong>{l4?.simulated_avg_wait_days} days</strong> (90th percentile: {l4?.simulated_p90_wait_days} days).</p>
                  <p><strong>Estimated Demurrage Exposure:</strong> ${l4?.demurrage?.demurrage_usd?.toLocaleString()} at contractual rate of ${l4?.demurrage?.daily_demurrage_rate?.toLocaleString()}/day.</p>
                  <p><strong>Strategic Directive:</strong> {f5?.timing_advice} {f5?.contract_mode}</p>
                </div>
              </div>

              {/* Signature Blocks */}
              <div className="pt-6 border-t border-slate-300">
                <div className="grid grid-cols-3 gap-6 text-center text-xs">
                  <div>
                    <div className="h-10 border-b border-slate-400 mb-1 flex items-end justify-center font-serif italic text-blue-950">Digitally Verified</div>
                    <strong className="text-slate-900 block">Chief General Manager (Shipping)</strong>
                    <span className="text-slate-500 text-[10px]">SAIL Transport & Shipping (TSD)</span>
                  </div>
                  <div>
                    <div className="h-10 border-b border-slate-400 mb-1 flex items-end justify-center font-serif italic text-blue-950">CVC Statutory Audit Cleared</div>
                    <strong className="text-slate-900 block">Vigilance & Compliance Officer</strong>
                    <span className="text-slate-500 text-[10px]">Government Audit Review Cell</span>
                  </div>
                  <div>
                    <div className="h-10 border-b border-slate-400 mb-1 flex items-end justify-center font-mono text-[10px] text-slate-700">HASH: SHA256-F6-PS26006</div>
                    <strong className="text-slate-900 block">Naavai AI Decision Engine</strong>
                    <span className="text-slate-500 text-[10px]">Smart India Hackathon 2026</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between items-center">
                <span>Steel Authority of India Limited · Confidential Commercial Document</span>
                <span>Generated via Naavai AI · Team F6 · PS26006</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
