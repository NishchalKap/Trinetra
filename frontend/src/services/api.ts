import axios from 'axios';
import { getCurrentLanguage } from '../i18n/translations';

// Detect if running in Electron desktop app
const isElectron = () => {
  try {
    return typeof window !== 'undefined' && (
      (window as any).navigator?.userAgent?.includes('Electron') ||
      typeof (window as any).require !== 'undefined'
    );
  } catch { return false; }
};

// Detect if running in mobile app (Capacitor/Cordova or file:// protocol)
const isMobile = () => {
  try {
    if (typeof window === 'undefined') return false;
    return typeof (window as any).Capacitor !== 'undefined' ||
           typeof (window as any).cordova !== 'undefined' ||
           /file:\/\//.test(window.location.href);
  } catch { return false; }
};

// Electron/mobile can connect to a local backend. Browser builds use the
// same-origin Vercel API service unless VITE_API_BASE_URL points to an
// external backend such as Render.
const normalizeHost = (h: string): string => {
  let host = h.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!host.includes(':')) host += ':8000';
  return host;
};

const configuredWebApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

const withApiPath = (value: string) => /\/api$/i.test(value) ? value : `${value}/api`;

export const getApiBase = () => {
  if (isElectron()) {
    const savedUrl = localStorage.getItem('trinetra_server_url');
    if (savedUrl) return `http://${normalizeHost(savedUrl)}/api`;
    return 'http://localhost:8000/api';
  }
  if (isMobile()) {
    const savedUrl = localStorage.getItem('trinetra_server_url');
    if (savedUrl) return `http://${normalizeHost(savedUrl)}/api`;
    // Default to localhost — works with adb reverse for USB-connected devices
    return 'http://localhost:8000/api';
  }
  if (configuredWebApiBase) return withApiPath(configuredWebApiBase);
  return '/api';
};

const api = axios.create({
  timeout: 20000,
});

// Dynamically set baseURL on every request so saved server URL changes
// take effect without requiring a full page reload.
api.interceptors.request.use((config) => {
  config.baseURL = getApiBase();
  return config;
});

// Allow mobile app to change server URL
export const setServerUrl = (url: string) => {
  localStorage.setItem('trinetra_server_url', url);
  window.location.reload();
};

export const getServerUrl = () => {
  return localStorage.getItem('trinetra_server_url') || '';
};

export const isMobileApp = isMobile;
export const canConfigureServer = () => isElectron() || isMobile();

// --- JWT token management ---
const TOKEN_KEY = 'trinetra_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAlertsWebSocketUrl(requestedDistrict?: string): string {
  const token = getStoredToken();
  let district = requestedDistrict || 'all';
  if (!requestedDistrict && token) {
    try {
      const rawPayload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const encodedPayload = rawPayload.padEnd(Math.ceil(rawPayload.length / 4) * 4, '=');
      const payload = JSON.parse(atob(encodedPayload));
      const allowedDistricts: string[] = Array.isArray(payload.districts) ? payload.districts : [];
      district = allowedDistricts.includes('*') ? 'all' : (allowedDistricts[0] || 'all');
    } catch {
      district = 'all';
    }
  }
  const apiBase = getApiBase();
  const absoluteApiUrl = new URL(apiBase, window.location.href);
  absoluteApiUrl.protocol = absoluteApiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  absoluteApiUrl.pathname = `${absoluteApiUrl.pathname.replace(/\/?api\/?$/, '')}/ws/alerts/${encodeURIComponent(district)}`;
  absoluteApiUrl.search = '';
  if (token) absoluteApiUrl.searchParams.set('token', token);
  return absoluteApiUrl.toString();
}

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear token so user is logged out
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearStoredToken();
      if (!window.location.pathname.includes('/login')) {
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

// --- Interfaces ---
export interface Station {
  id: number;
  station_id: string;
  name: string;
  latitude: number;
  longitude: number;
  state: string;
  district: string;
  village: string;
  elevation: number;
  slope_angle: number;
  soil_type: string;
  vegetation_cover: number;
  is_active: boolean;
  latest_reading: {
    rainfall_mm: number;
    soil_moisture: number;
    ground_displacement: number;
    timestamp: string;
  } | null;
  risk: {
    level: string;
    score: number;
    probability: number;
  } | null;
}

export interface DashboardStats {
  total_stations: number;
  active_stations: number;
  risk_distribution: { low: number; moderate: number; high: number; critical: number };
  active_alerts: number;
  pending_reports: number;
  recent_reports_24h: number;
  road_status: { open: number; partially_blocked: number; blocked: number };
  affected_population: number;
  total_villages: number;
  high_risk_villages: number;
  average_risk_score: number;
  last_updated: string;
}

export interface Alert {
  id: number;
  station_id: string;
  risk_level: string;
  title: string;
  message: string;
  status: string;
  affected_population: number;
  latitude: number;
  longitude: number;
  created_at: string;
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  risk_score: number;
  risk_level: string;
  station_name: string;
  station_id: string;
  state: string;
  district: string;
}

export interface Road {
  id: number;
  road_name: string;
  road_type: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  status: string;
  blockage_reason: string | null;
  alternative_route: string | null;
}

export interface Village {
  id: number;
  name: string;
  state: string;
  district: string;
  latitude: number;
  longitude: number;
  population: number;
  risk_zone: string;
  nearest_hospital_km: number;
  nearest_police_km: number;
}

export interface Report {
  id: number;
  report_type: string;
  description: string;
  latitude: number;
  longitude: number;
  reporter_name: string | null;
  reporter_language?: string | null;
  status: string;
  created_at: string;
}

export interface WeatherData {
  temperature: number;
  humidity: number;
  rainfall_1h: number;
  rainfall_24h: number;
  rainfall_7d: number;
  wind_speed: number;
  wind_direction: number;
  pressure: number;
  visibility: number;
  forecast_rainfall_24h: number;
  forecast_rainfall_48h: number;
  timestamp: string;
}

export interface PredictResult {
  location: { latitude: number; longitude: number };
  nearest_station: { station_id: string; name: string; distance_km: number } | null;
  risk_assessment: {
    risk_score: number;
    risk_level: string;
    landslide_probability: number;
    contributing_factors: string[];
    predicted_time_window_hours: number;
    recommendation: string;
    probabilities: Record<string, number>;
  };
  model_info: { type: string; training_samples: string; features: number; feature_names: string[] };
  timestamp: string;
}

export interface TimelineEntry {
  timestamp: string;
  alerts: { id: number; station_id: string; risk_level: string; title: string; status: string; affected_population: number; created_at: string }[];
  total_affected: number;
  max_risk: string;
}

// --- Auth ---
export const loginAPI = (email: string, password: string) => {
  const params = new URLSearchParams();
  params.append('email', email);
  params.append('password', password);
  return api.post<{ token: string; user: { email: string; name: string; role: string } }>('/auth/login', params);
};

// --- Dashboard ---
export const getDashboardStats = () => api.get<DashboardStats>('/dashboard/stats');
export const getRiskHeatmap = () => api.get<HeatmapPoint[]>('/dashboard/risk-heatmap');
export const getRainfallTrend = () => api.get<{ timestamp: string; avg_rainfall: number }[]>('/dashboard/rainfall-trend');
export const getRiskTrend = () => api.get<{ timestamp: string; avg_risk: number }[]>('/dashboard/risk-trend');
export const getStateSummary = () => api.get<{ state: string; stations: number; avg_risk_score: number; critical_count: number }[]>('/dashboard/state-summary');

// --- Sensors ---
export const getStations = () => api.get<Station[]>('/sensors/stations');
export const getStation = (id: string) => api.get(`/sensors/stations/${id}`);
export const getStationHistory = (id: string, hours = 24) => api.get(`/sensors/stations/${id}/history?hours=${hours}`);
export const getAllLatestReadings = () =>
  api.get<{ station_id: string; rainfall_mm: number; soil_moisture: number; ground_displacement: number; timestamp: string }[]>('/sensors/readings/latest');

// --- Alerts ---
export const getAlerts = (params?: { status?: string; risk_level?: string }) =>
  api.get<Alert[]>('/alerts', { params: { ...params, lang: getCurrentLanguage() } });
export const getActiveAlerts = () => api.get<Alert[]>('/alerts/active');
export const getAlertStats = () => api.get<{ total: number; active: number; acknowledged: number; resolved: number; critical_active: number; high_active: number }>('/alerts/stats');
export const acknowledgeAlert = (id: number) => api.put(`/alerts/${id}/acknowledge`);
export const resolveAlert = (id: number) => api.put(`/alerts/${id}/resolve`);
export const getAlertTimeline = (hours: number = 72, riskLevel?: string) =>
  api.get<{ timeline: TimelineEntry[]; summary: { total_alerts: number; total_hours: number; critical_count: number; high_count: number; moderate_count: number; low_count: number; total_affected_population: number } }>('/alerts/timeline', { params: { hours, risk_level: riskLevel } });
export const getAlertHistory = (days: number = 30) =>
  api.get<{ date: string; critical: number; high: number; moderate: number; low: number; total: number }[]>('/alerts/history', { params: { days } });

// --- Reports ---
export const getReports = (params?: { status?: string }) => api.get<Report[]>('/reports', { params });
export const submitReport = (formData: FormData) => api.post('/reports', formData);
export const verifyReport = (id: number) => api.put(`/reports/${id}/verify`);
export const dismissReport = (id: number) => api.put(`/reports/${id}/dismiss`);

// --- Roads & Villages ---
export const getRoads = () => api.get<Road[]>('/roads');
export const getVillages = (riskZone?: string) => api.get<Village[]>('/villages', { params: riskZone ? { risk_zone: riskZone } : {} });

// --- Weather ---
export const getWeather = (stationId: string) => api.get<{ data: WeatherData }>(`/weather/${stationId}`);
export const getWeatherForecast = (stationId: string, hours = 48) =>
  api.get<{ timestamp: string; temperature: number; rainfall_1h: number; forecast_rainfall_24h: number; humidity: number }[]>(`/weather/${stationId}/forecast?hours=${hours}`);

// --- Simulator ---
export interface SimulationEvent {
  station: {
    id: string; name: string; state: string; district: string; village: string;
    slope_angle: number; elevation: number;
  };
  intensity: string;
  sensor_spikes: {
    rainfall_mm: number; soil_moisture: number; ground_displacement_mm: number;
    pore_water_pressure_kpa: number; vibration_level: number;
  };
  ai_assessment: {
    risk_score: number;
    risk_level: string;
    landslide_probability: number;
    recommendation: string;
    attention_unet_hazard_m2: number;
    coverage_percent: number;
    model: string;
  };
  alert_generated: { title: string; level: string; message: string; affected_population: number } | null;
}
export interface SimulationResult {
  status: string;
  simulation: SimulationEvent;
}
export const simulateLandslide = (data: { station_id?: string; intensity?: string }) =>
  api.post<SimulationResult>('/simulate/landslide', data);
export const simulateBatch = (count: number = 5) =>
  api.post<{ status: string; simulated_events: number; events: SimulationEvent[] }>(`/simulate/batch?stations_count=${count}`);
export const resetSimulation = () => api.post('/simulate/reset');

// --- Predict (Click-to-Predict on Map) ---
export const predictAtLocation = (data: {
  latitude: number; longitude: number;
  slope?: number; elevation?: number;
  rainfall_mm?: number; soil_moisture?: number; ndvi?: number;
}) => api.post<PredictResult>('/predict', data);

// --- Export ---
export const exportGeoJSON = () => api.get('/export/geojson');
export const exportCSV = () => api.get('/export/csv', { responseType: 'blob' });
export const exportRiskZones = () => api.get('/export/risk-zones');

// --- Satellite ---
export interface SatelliteStation {
  id: string; name: string; state: string;
  real_elevation: number;
  real_soil_moisture_0_7cm: number; real_soil_moisture_7_28cm: number;
  real_soil_moisture_28_100cm: number; real_soil_temperature: number;
  real_rainfall_current: number; real_rainfall_24h: number; real_rainfall_7d: number;
  real_temperature: number; real_humidity: number; real_wind_speed: number;
  estimated_ndvi: number;
  real_pressure?: number;
}
export interface SatelliteSummary {
  total_stations: number;
  elevation: { min: number; max: number; avg: number; unit: string };
  soil_moisture_surface: { min: number; max: number; avg: number; unit: string };
  rainfall_24h: { min: number; max: number; avg: number; total: number; unit: string };
  rainfall_7d: { min: number; max: number; avg: number; total: number; unit: string };
  ndvi: { min: number; max: number; avg: number; description: string };
  temperature: { min: number; max: number; avg: number; unit: string };
  humidity: { min: number; max: number; avg: number; unit: string };
  data_source: string;
}
export interface SatelliteRiskZone {
  station_id: string; name: string; state: string; lat: number; lng: number;
  satellite_risk_score: number; risk_level: string;
  factors: { elevation_risk: number; soil_moisture_risk: number; rainfall_risk: number; vegetation_risk: number };
  real_data: { elevation: number; soil_moisture: number; rainfall_24h: number; ndvi: number };
}
export const getSatelliteData = () => api.get<{ stations: SatelliteStation[]; total_stations: number }>('/satellite/data');
export const getStationSatelliteData = (id: string) => api.get<SatelliteStation>(`/satellite/data/${id}`);
export const getSatelliteSummary = () => api.get<SatelliteSummary>('/satellite/summary');
export const getSatelliteRiskZones = () => api.get<SatelliteRiskZone[]>('/satellite/risk-zones');

// --- Flood Data ---
export interface FloodDistrict {
  district: string;
  annual_flood_days: number;
  historical_events: number;
  flood_risk_score: number;
  river_systems: string[];
}
export interface FloodSummary {
  total_districts: number;
  avg_risk_score: number;
  max_risk_district: string;
  max_risk_score: number;
  total_historical_events: number;
  avg_annual_flood_days: number;
  high_risk_districts: number;
  data_source: string;
}
export interface FloodLandslideCorrelation {
  district: string;
  flood_risk: number;
  landslide_risk: number;
  compound_risk: number;
  river_systems: string[];
  has_landslide_data: boolean;
}
export const getFloodData = (minRisk?: number) =>
  api.get<{ data: FloodDistrict[]; total_districts: number }>('/flood/data', { params: minRisk ? { min_risk: minRisk } : {} });
export const getFloodSummary = () => api.get<FloodSummary>('/flood/summary');
export const getFloodCorrelation = () =>
  api.get<{ correlation: FloodLandslideCorrelation[]; insight: string }>('/flood/correlation');

// --- ML Enhanced (XGBoost + Terrain Lookup) ---
export interface MLPredictionResult {
  risk_score: number;
  risk_level: string;
  confidence: number;
  source: string;
  factors: { rainfall_risk: string; slope_risk: string; vegetation_risk: string };
  feature_importance: Record<string, number> | null;
  terrain_data: { slope: number; elevation: number; ndvi: number; soil_moisture: number; distance_to_road: number; source: string };
  latitude: number;
  longitude: number;
}
export interface MLHealth {
  status: string;
  model_loaded: boolean;
  model_type: string;
  terrain_lookup: boolean;
  version: string;
}
export interface MLDistrictRisk {
  district: string;
  risk_level: string;
  risk_score: number;
  zone_count: number;
  critical_count: number;
  high_count: number;
  predictions: MLPredictionResult[];
}
export interface MLRiskGrid {
  grid: { lat: number; lng: number; risk_score: number; risk_level: string }[];
  bounds: { lat_min: number; lat_max: number; lon_min: number; lon_max: number };
  resolution: number;
  count: number;
}
export const getMLHealth = () => api.get<MLHealth>('/ml/health');
export const mlPredict = (data: { latitude: number; longitude: number; slope?: number; elevation?: number; rainfall_24hr?: number; soil_moisture?: number; ndvi?: number }) =>
  api.post<MLPredictionResult>('/ml/predict', data);
export const mlBatchPredict = (locations: { latitude: number; longitude: number }[]) =>
  api.post<{ predictions: MLPredictionResult[]; count: number }>('/ml/predict/batch', { locations });
export const getMLRiskGrid = (resolution: number = 10) =>
  api.get<MLRiskGrid>('/ml/risk/grid', { params: { resolution } });
export const getMLDistrictRisk = (district: string) =>
  api.get<MLDistrictRisk>(`/ml/risk/district/${district}`);
export const trainMLModel = () => api.post<{ message: string; details: any }>('/ml/train');

// --- Landslide Semantic Segmentation & RCAN Super-Resolution (Eb3ls/landslides_segmentation) ---
export interface SegmentationSummary {
  total_stations_evaluated: number;
  total_hazard_area_m2: number;
  total_hazard_area_ha: number;
  mean_model_iou: number;
  mean_dice_score: number;
  critical_hazard_stations: number;
  high_hazard_stations: number;
}

export interface StationSegmentation {
  station_id: string;
  station_name: string;
  coordinates: { lat: number; lng: number };
  terrain_input: {
    slope_angle_deg: number;
    ndvi: number;
    soil_moisture_pct: number;
    rainfall_24h_mm: number;
  };
  segmentation_results: {
    risk_tier: 'low' | 'moderate' | 'high' | 'critical';
    landslide_pixels: number;
    total_pixels: number;
    hazard_area_m2: number;
    hazard_area_ha: number;
    coverage_percent: number;
    max_probability: number;
    mean_probability: number;
    confidence_iou: number;
    dice_score: number;
  };
  super_resolution: {
    model: string;
    native_resolution: string;
    enhanced_resolution: string;
    psnr_rgb: number;
    ssim: number;
  };
  polygons: number[][][];
  spectral_summary: {
    red_mean_dn: number;
    green_mean_dn: number;
    blue_mean_dn: number;
    nir_mean_dn: number;
  };
  visual_layers?: {
    lr_rgb_grid: number[][][];
    sr_rgb_grid: number[][][];
    prob_mask_grid: number[][];
  };
}

export interface SegmentationModelsMetadata {
  source_repository: string;
  architectures: {
    rcan_super_resolution: {
      model_name: string;
      scale_factor: string;
      psnr_rgb_db: number;
      psnr_nir_db: number;
      ssim: number;
      lpips: number;
      loss_function: string;
    };
    attention_unet_segmentation: {
      model_name: string;
      mean_iou: number;
      dice_score: number;
      overall_accuracy: number;
      loss_function: string;
      training_patches: number;
    };
  };
  feature_channels: { index: number; band: string; wavelength?: string; type?: string; resolution?: string }[];
  loss_functions: string[];
}

export interface HistoricalLandslideEvent {
  date: string;
  lat: number;
  lng: number;
  state: string;
  district: string;
  trigger: string;
  severity: string;
  elevation: number;
  slope: number;
  soil_type: string;
  vegetation_cover: number;
}

export interface EvacuationShelter {
  id: string;
  name: string;
  state: string;
  district: string;
  lat: number;
  lng: number;
  elevation: number;
  capacity: number;
  medical_support: boolean;
  status: string;
  contact: string;
}

export const getSegmentationModels = () =>
  api.get<SegmentationModelsMetadata>('/segmentation/models');

export const getStationSegmentationData = () =>
  api.get<{ summary: SegmentationSummary; stations: StationSegmentation[] }>('/segmentation/stations');

export const runSegmentationInference = (data: {
  station_name?: string;
  lat: number;
  lng: number;
  slope_angle: number;
  ndvi: number;
  soil_moisture: number;
  rainfall_24h: number;
}) => api.post<StationSegmentation>('/segmentation/inference', data);

export const getHistoricalLandslideEvents = () =>
  api.get<{ events: HistoricalLandslideEvent[]; total: number }>('/satellite/historical-events');

export const getEvacuationShelters = () =>
  api.get<{ shelters: EvacuationShelter[]; total: number }>('/satellite/shelters');

export interface RoiScanRequest {
  lat: number;
  lng: number;
  location_name?: string;
  slope_angle?: number;
  ndvi?: number;
  soil_moisture?: number;
  rainfall_24h?: number;
}

export interface RoiScanResult {
  status: string;
  metadata: {
    location_name: string;
    center_coordinates: { lat: number; lng: number };
    satellite_platform: string;
    dem_source: string;
    spatial_resolution: string;
    date_acquired: string;
    cloud_cover_percent: number;
  };
  terrain_metrics: {
    slope_angle_deg: number;
    mean_ndvi: number;
    mean_ndmi_moisture: number;
    soil_moisture_pct: number;
    rainfall_24h_mm: number;
  };
  segmentation_results: {
    risk_tier: 'low' | 'moderate' | 'high' | 'critical';
    hazard_area_m2: number;
    hazard_area_hectares: number;
    max_probability: number;
    mean_probability: number;
    model_mean_iou: number;
    model_dice_score: number;
    estimated_runout_velocity_ms: number;
    estimated_debris_volume_m3: number;
    factor_of_safety: number;
  };
  geojson: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      properties: {
        feature_id: string;
        feature_type: string;
        area_m2: number;
        area_hectares: number;
        mean_probability: number;
        risk_level: 'low' | 'moderate' | 'high' | 'critical';
        scarp_length_m: number;
        estimated_volume_m3: number;
      };
      geometry: {
        type: 'Polygon';
        coordinates: number[][][];
      };
    }>;
  };
  spectral_previews: {
    true_color_rgb_native: string;
    true_color_rgb_rcan_5x: string;
    false_color_infrared_nir: string;
    ndvi_vegetation_mask: string;
    unet_probability_mask: string;
  };
}

export const scanRoiWithAttentionUnet = (data: RoiScanRequest) =>
  api.post<RoiScanResult>('/segmentation/scan-roi', data);

export const getSatelliteLayerTemplates = () =>
  api.get<{ layers: Array<{ id: string; name: string; type: string; url_template: string; attribution: string; resolution: string; max_zoom: number }> }>('/segmentation/satellite-layers');

export default api;
export { api };



