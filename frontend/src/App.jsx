import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Ship, Anchor, TrendingDown, TrendingUp, ShieldCheck, FileText,
  CheckCircle2, AlertTriangle, Activity, Map, BarChart3, Target
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
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [congestion, setCongestion] = useState(null);
  const [aisVessels, setAisVessels] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
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

  const download = async (kind) => {
    try {
      const endpoint = kind === 'audit' ? 'audit-receipt' : 'broker-order';
      const res = await axios.post(`${API}/${endpoint}`, formData, { responseType: 'text' });
      const blob = new Blob([res.data], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = kind === 'audit' ? 'Naavai_SHAP_Audit.txt' : 'Naavai_Broker_Order.txt';
      a.click();
      toast(kind === 'audit' ? 'CVC/CAG Audit downloaded.' : 'Broker order downloaded.');
    } catch {
      toast('Backend not reachable.', 'error');
    }
  };

  const clearance = result?.layer2_clearance;
  const f3 = result?.layer3_ml_forecast;
  const f5 = result?.layer5_recommendation;

  // Dynamic delta vs current user-entered FFA (not hardcoded)
  const ffa = parseFloat(formData.current_ffa_30d) || 21;
  const p50 = f3?.P50_recommended_rate;
  const deltaPct = p50 != null ? (((p50 - ffa) / ffa) * 100).toFixed(1) : null;
  const deltaPositive = deltaPct > 0;

  // SHAP contributions sorted by absolute value for waterfall display
  const shapContribs = f3?.shap_audit?.contributions_usd_mt || {};
  const shapEntries = Object.entries(shapContribs).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  // Portfolio schedule assignments
  const assignments = f5?.portfolio_optimization?.schedule_assignments || [];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="flex justify-between items-center border-b border-slate-700 px-8 py-4">
        <div>
          <h1 className="text-2xl font-extrabold text-blue-400 flex items-center gap-3">
            <Ship className="h-7 w-7" /> Naavai AI
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">Decision-Support System for SAIL TSD Kolkata — Team F6 · SIH 2026 PS26006</p>
        </div>
        <div className="flex items-center gap-3">
          {result && <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono bg-emerald-900/40 border border-emerald-700 px-3 py-1.5 rounded-full"><CheckCircle2 className="h-3.5 w-3.5" /> All Layers Executed</span>}
          <span className="bg-blue-900 text-blue-200 text-xs px-3 py-1.5 rounded-full border border-blue-700 font-mono">v2.0.0 · Production</span>
        </div>
      </header>

      <div className="flex gap-0 border-b border-slate-700 px-8">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition ${activeTab === i ? 'border-blue-400 text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="p-8">
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
                      <p className="text-2xl font-black text-amber-300 mt-1">${result.layer2_naval_physics.breakeven_floor_usd_mt}<span className="text-xs font-normal text-slate-400"> /MT</span></p>
                      <p className="text-xs text-slate-500 mt-1">Commercial: ${result.layer2_naval_physics.commercial_breakeven_floor_usd_mt}/MT</p>
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
                      <p><strong className="text-blue-300">SimPy Port Wait:</strong> {result.layer4_queue_demurrage.simulated_avg_wait_days}d avg · P90: {result.layer4_queue_demurrage.simulated_p90_wait_days}d · Risk: ${result.layer4_queue_demurrage.demurrage.demurrage_usd?.toLocaleString()}</p>
                      <p><strong className="text-blue-300">Portfolio Savings:</strong> ₹{f5.portfolio_optimization?.portfolio_savings_inr_cr} Cr on {f5.portfolio_optimization?.total_cargoes} cargoes (Spot→COA)</p>
                    </div>
                    <div className="flex gap-3 pt-1">
                      <button onClick={() => download('audit')} className="bg-purple-700 hover:bg-purple-600 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                        <CheckCircle2 className="h-4 w-4" /> Export SHAP Audit (CVC/CAG)
                      </button>
                      <button onClick={() => download('broker')} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                        <FileText className="h-4 w-4" /> Draft Broker Cargo Order
                      </button>
                      <button onClick={() => setActiveTab(1)} className="bg-emerald-700 hover:bg-emerald-600 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                        <BarChart3 className="h-4 w-4" /> View Portfolio Schedule
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
    </div>
  );
}
