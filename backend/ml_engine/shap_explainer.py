"""Layer 3b: SHAP audit explainer. Team F6."""
try:
    import shap
except Exception:
    shap = None


_EXPLAINER_CACHE = {}


def explain_forecast(model, X_row, feature_names: list, base_fallback: float = 18.0) -> dict:
    if shap is None:
        return {"base": base_fallback, "contributions_usd_mt": {}, "note": "shap library not installed"}
    
    try:
        model_id = id(model)
        if model_id not in _EXPLAINER_CACHE:
            _EXPLAINER_CACHE[model_id] = shap.TreeExplainer(model)
        
        explainer = _EXPLAINER_CACHE[model_id]
        vals = explainer.shap_values(X_row)
        
        # Extract base value from model
        base_val = getattr(explainer, "expected_value", base_fallback)
        if isinstance(base_val, (list, tuple)):
            base_val = base_val[0]
        base_val = float(base_val)

        # Handle 1D or 2D array output
        row_vals = vals[0] if (hasattr(vals, "shape") and len(vals.shape) > 1) else vals
        contribs = {}
        for f, v in zip(feature_names, row_vals):
            contribs[f] = round(float(v), 3)

        return {
            "base_rate_usd_mt": round(base_val, 2),
            "contributions_usd_mt": contribs,
            "net_prediction_usd_mt": round(base_val + sum(contribs.values()), 2),
            "status": "LIVE_SHAP_COMPUTED",
        }
    except Exception as e:
        return {
            "base_rate_usd_mt": base_fallback,
            "contributions_usd_mt": {},
            "status": f"FALLBACK ({e})",
        }

