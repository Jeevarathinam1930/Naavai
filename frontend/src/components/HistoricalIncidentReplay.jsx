import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, CheckCircle2, Info, Play, Pause, RotateCcw, ArrowRight, Target, FileText } from 'lucide-react';
import { API } from '../config';

const statusMeta = {
  ok: { icon: CheckCircle2, label: 'No issue', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  info: { icon: Info, label: 'Context', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  warn: { icon: AlertTriangle, label: 'Contributing factor', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  critical: { icon: AlertTriangle, label: 'Preventable exposure', color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
};

export default function HistoricalIncidentReplay({ onReplayIncident, onOpenAudit, activeIncidentId, simulationResult }) {
  const [incidents, setIncidents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(5);
  const [playing, setPlaying] = useState(false);
  const [openStage, setOpenStage] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    axios.get(`${API}/historical-incidents`).then(res => {
      const list = res.data?.incidents || [];
      setIncidents(list);
      if (list.length && !selected) {
        const initial = list.find(item => item.id === activeIncidentId) || list[0];
        setSelected(initial); setRevealed(0); setPlaying(true);
        // A replay is a real engine run, even when the user does not edit inputs.
        onReplayIncident?.(initial);
      }
    }).catch(err => setLoadError(err?.response?.data?.detail || err?.message || 'Incident catalog unavailable'));
  }, []);

  useEffect(() => {
    if (!playing || !selected) return undefined;
    setRevealed(0);
    const timer = window.setInterval(() => setRevealed(prev => {
      if (prev >= 5) { window.clearInterval(timer); setPlaying(false); return 5; }
      return prev + 1;
    }), 800);
    return () => window.clearInterval(timer);
  }, [playing, selected]);

  const selectIncident = (incident, autoPlay = false) => {
    setSelected(incident); setRevealed(autoPlay ? 0 : 5); setOpenStage(null); setPlaying(autoPlay);
    onReplayIncident?.(incident);
  };
  const current = selected || incidents[0];
  const heroStage = current?.heroStage || 3;
  const hero = current?.hero;
  const stages = useMemo(() => current?.stages || [], [current]);
  const resultMatchesIncident = simulationResult?.inputs?.incident_id === current?.id;
  const engineStages = resultMatchesIncident ? (simulationResult?.decision_flow || []) : [];
  const engineStage = n => engineStages[n - 1];
  const resultRate = resultMatchesIncident ? simulationResult?.layer3_ml_forecast?.P50_recommended_rate : null;
  const engineRecommendation = resultMatchesIncident ? simulationResult?.layer5_recommendation : null;
  const engineSavingsCr = engineRecommendation?.single_voyage_spot_usd != null && engineRecommendation?.single_voyage_coa_usd != null
    ? Math.max(0, ((engineRecommendation.single_voyage_spot_usd - engineRecommendation.single_voyage_coa_usd) * 84) / 10000000).toFixed(2)
    : null;
  const replayWait = resultMatchesIncident ? simulationResult?.layer4_queue_demurrage?.simulated_avg_wait_days : null;
  const replayDemurrageCr = resultMatchesIncident && simulationResult?.layer4_queue_demurrage?.demurrage?.demurrage_usd != null
    ? (simulationResult.layer4_queue_demurrage.demurrage.demurrage_usd * 84 / 10000000).toFixed(2) : null;
  if (!current && !loadError) return <div className="rounded-xl bg-white border border-slate-200 p-6 text-sm text-slate-500">Loading report-backed incidents…</div>;

  return <div className="space-y-5">
    {loadError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Unable to load the incident catalog: {loadError}</div>}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {incidents.map(incident => <button key={incident.id} onClick={() => selectIncident(incident)} className={`text-left rounded-xl border p-4 transition ${current?.id === incident.id ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
        <div className="flex justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">{incident.period}</span><span className={`text-[11px] font-bold ${incident.sourceStatus === 'conflict' ? 'text-amber-700' : 'text-blue-700'}`}>{incident.sourceStatus === 'conflict' ? '⚠ Under verification' : 'Primary source'}</span></div>
        <h2 className="font-bold text-slate-900 mt-2">{incident.title}</h2>
        <strong className="block text-xl text-rose-600 mt-3">{incident.financial_loss} <span className="text-xs font-medium text-slate-500">{incident.financialLabel || 'reported exposure'}</span></strong>
        <span className="inline-flex items-center gap-1 mt-3 text-sm font-bold text-blue-600">Replay <ArrowRight className="h-4 w-4" /></span>
      </button>)}
    </div>

    {current && <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
      <div className="bg-[#0b2346] text-white p-5 md:p-6 flex flex-wrap items-start justify-between gap-4">
        <div><div className="text-xs font-bold uppercase tracking-widest text-amber-300">{current.period} · Incident Replay</div><h2 className="text-2xl font-black mt-1">{current.title}</h2><p className="text-sm text-slate-300 mt-2">Source: {current.source} {current.sourceUrl && <a className="ml-2 underline text-blue-200" href={current.sourceUrl} target="_blank" rel="noreferrer">Open source</a>}</p>{current.sourceNote && <p className="text-xs text-amber-200 mt-2">Evidence note · {current.sourceNote}</p>}</div>
        <div className="rounded-xl bg-rose-600 text-white px-4 py-3 text-right"><span className="block text-xs font-bold uppercase">{current.financialLabel || 'Reported exposure'}</span><strong className="text-2xl">{current.financial_loss}</strong></div>
      </div>
      <div className="px-5 pt-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div><span className="block text-xs text-slate-500">Cargo</span><strong>{current.inputs?.cargo_type || 'Bulk cargo'}</strong></div>
          <div><span className="block text-xs text-slate-500">Origin</span><strong>{current.inputs?.origin_port || '—'}</strong></div>
          <div><span className="block text-xs text-slate-500">Destination</span><strong>{current.inputs?.destination_port || '—'}</strong></div>
          <div><span className="block text-xs text-slate-500">Parcel</span><strong>{current.inputs?.tonnage?.toLocaleString?.() || '—'} MT</strong></div>
          <div><span className="block text-xs text-slate-500">Vessel class</span><strong>{current.inputs?.vessel_class || '—'}</strong></div>
        </div>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
          <section className="rounded-xl border border-rose-200 bg-rose-50/70 p-5"><span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Historical record · Source</span><h3 className="mt-1 text-lg font-extrabold text-slate-900">What happened</h3><p className="mt-2 text-sm leading-5 text-slate-600">{current.summary}</p><div className="mt-4 border-t border-rose-200 pt-3"><span className="text-xs text-slate-500">{current.financialLabel || 'Reported exposure'}</span><strong className="block text-2xl font-black text-rose-700">{current.financial_loss}</strong></div></section>
          <div className="hidden lg:flex items-center justify-center text-3xl font-bold text-blue-600" aria-hidden="true">→</div>
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5"><span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Simulated outcome · Naavai replay</span><h3 className="mt-1 text-lg font-extrabold text-slate-900">What Naavai calculates</h3><p className="mt-2 text-sm leading-5 text-slate-600">{hero?.naavaiAdvice || 'The five-stage analysis is being calculated from the historical case inputs.'}</p><div className="mt-4 grid grid-cols-3 gap-2 border-t border-emerald-200 pt-3 text-sm"><div><span className="block text-xs text-slate-500">Freight P50</span><strong>{resultRate != null ? `$${Number(resultRate).toFixed(2)}/MT` : 'Calculating'}</strong></div><div><span className="block text-xs text-slate-500">Port wait</span><strong>{replayWait != null ? `${replayWait} days` : 'Calculating'}</strong></div><div><span className="block text-xs text-slate-500">Demurrage est.</span><strong>{replayDemurrageCr != null ? `₹${replayDemurrageCr} Cr` : 'Calculating'}</strong></div></div></section>
        </div>
        <section className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4"><div><span className="text-xs font-bold uppercase tracking-wide text-emerald-800">Engine comparison · simulated</span><p className="mt-1 text-xs text-slate-600">A savings estimate is shown only when both Spot and COA values exist for this parcel.</p></div><strong className="text-2xl font-black text-emerald-800">{engineSavingsCr != null ? `₹${engineSavingsCr} Cr simulated` : 'No comparable COA estimate'}</strong></section>
        <div className="mt-5 flex items-center gap-1" aria-label="Incident replay stage progress">{[1,2,3,4,5].map(n => <React.Fragment key={n}><button onClick={() => { setRevealed(n); setPlaying(false); }} aria-label={`Show replay stage ${n}`} aria-current={revealed === n ? 'step' : undefined} className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${n === heroStage ? 'ring-2 ring-blue-500 ring-offset-2' : ''} ${n <= revealed ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{n === heroStage ? <Target className="h-4 w-4" /> : n}</button>{n < 5 && <span className={`h-1 flex-1 rounded ${n < revealed ? 'bg-blue-500' : 'bg-slate-200'}`} />}</React.Fragment>)}</div>
      </div>
      <div className="p-5 space-y-2">
        {stages.map(stage => {
          const meta = statusMeta[stage.status] || statusMeta.info; const Icon = meta.icon; const isHero = stage.n === heroStage;
          if (stage.n > revealed) return null;
          const live = engineStage(stage.n);
          const liveMetric = live?.status === 'FAILED' && stage.n === 2
            ? (live.metric || '').replace('Draft Cleared', 'Draft restricted')
            : live?.metric;
          const liveSubmetric = live?.submetric?.includes('₹0.00 Cr')
            ? 'No savings vs alternatives; risk avoided through the recommended action'
            : live?.submetric;
          const liveResult = live ? `${liveMetric}${liveSubmetric ? ` · ${liveSubmetric}` : ''}` : null;
          return isHero ? <div key={stage.n} className="rounded-2xl border-2 border-blue-500 bg-blue-50/50 p-5 mt-3">
            <div className="text-xs font-black uppercase tracking-widest text-blue-700 flex items-center gap-2"><Target className="h-4 w-4" /> Decisive Stage · Stage {stage.n} {stage.oneLine}</div>
            <div className="grid md:grid-cols-2 gap-4 mt-4"><div className="rounded-xl bg-rose-50 border border-rose-200 p-4"><h3 className="font-bold text-rose-800">Historical evidence</h3>{hero?.wentWrong?.map((line, i) => <p key={i} className="text-sm text-slate-700 mt-2">{line}</p>)}<strong className="block text-2xl text-rose-600 mt-4">{current.financial_loss}</strong><span className="text-xs text-slate-500">{current.financialLabel || 'reported exposure'}</span></div><div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4"><h3 className="font-bold text-emerald-800">What the engine calculated</h3><p className="text-lg font-bold text-slate-900 mt-2">{hero?.naavaiAdvice}</p>{hero?.supporting?.map((line, i) => <p key={i} className="text-sm text-slate-700 mt-2">{line}</p>)}{liveResult && <p className="text-sm font-bold text-blue-700 mt-3">Live Stage {stage.n}: {liveResult}</p>}{live?.explanation && <p className="text-sm text-slate-700 mt-2">{live.explanation}</p>}</div></div>
            <div className="mt-4 rounded-lg bg-white border border-blue-200 px-4 py-3 text-sm font-semibold text-slate-800">{engineSavingsCr != null ? `Spot vs COA estimate: ₹${engineSavingsCr} Cr (simulated); this is not a reconstruction of the historical loss.` : `Preventable exposure (per Report): ₹${hero?.preventableExposureCr} Cr; no comparable COA estimate was produced for this Spot-only replay.`}</div>
            <button onClick={() => setOpenStage(openStage === stage.n ? null : stage.n)} className="text-sm text-blue-700 font-bold mt-3">{openStage === stage.n ? 'Hide calculation' : 'Show calculation'}</button>{openStage === stage.n && <p className="text-sm text-slate-600 mt-2 max-w-prose">Report context: {stage.detail} {live?.explanation ? `Engine calculation: ${live.explanation}` : 'Engine calculation is still running.'}</p>}
          </div> : <div key={stage.n} className={`rounded-xl border px-4 py-3 ${meta.bg}`}><div className="flex items-center gap-3"><span className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-slate-700">{stage.n}</span><strong className="text-slate-900">{stage.oneLine}</strong><span className="text-sm text-slate-700 flex-1">→ {liveResult || stage.detail}</span><Icon className={`h-4 w-4 ${meta.color}`} /><span className="text-[11px] text-slate-500">{live ? 'Engine result' : stage.origin === 'report' ? 'From Report' : stage.origin === 'engine' ? 'Engine input' : 'Not applicable'}</span><button onClick={() => setOpenStage(openStage === stage.n ? null : stage.n)} className="text-xs font-bold text-blue-700">Details</button></div>{openStage === stage.n && <p className="ml-11 mt-2 text-sm text-slate-700"><strong>Report context:</strong> {stage.detail}{live?.explanation && <><br /><strong>Engine justification:</strong> {live.explanation}</>}</p>}</div>;
        })}
      </div>
      {!playing && revealed >= 5 && <div className="mx-5 mb-5 rounded-xl bg-slate-900 text-white p-4"><div className="grid md:grid-cols-3 gap-3 text-sm"><div><span className="text-slate-400 block">{current.financialLabel || 'Historical case figure'}</span><strong className="text-lg">{current.financial_loss}</strong></div><div><span className="text-slate-400 block">Naavai advice</span><strong>{hero?.naavaiAdvice}</strong></div><div><span className="text-slate-400 block">Engine outcome</span><strong className="text-emerald-300">{engineSavingsCr != null ? `₹${engineSavingsCr} Cr simulated` : 'No comparable Spot/COA simulation'}</strong></div></div><p className="text-xs text-slate-400 mt-3">Simulated replay on representative inputs. Historical source figures and engine estimates are separate; this is not a reconstruction of the reported case amount.</p></div>}
      <div className="border-t border-slate-200 px-5 py-4 flex flex-wrap gap-2 justify-between"><div className="flex gap-2"><button onClick={() => setPlaying(!playing)} className="inline-flex items-center gap-2 bg-slate-800 text-white px-3 py-2 rounded-lg text-sm font-bold">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? 'Pause' : 'Play story'}</button><button onClick={() => { setRevealed(5); setPlaying(false); }} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 rounded-lg text-sm font-bold"><ArrowRight className="h-4 w-4" /> Skip to result</button><button onClick={() => selectIncident(current, true)} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 rounded-lg text-sm font-bold"><RotateCcw className="h-4 w-4" /> Replay</button></div><button disabled={!resultMatchesIncident} onClick={() => onOpenAudit?.()} className="inline-flex items-center gap-2 text-blue-700 font-bold text-sm disabled:cursor-not-allowed disabled:opacity-40"><FileText className="h-4 w-4" /> Generate audit PDF</button></div>
    </div>}
  </div>;
}
