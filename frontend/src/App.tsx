import { HashRouter as Router, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
import { t, setLanguage, getCurrentLanguage, Language, languages } from './i18n/translations';
import { loginAPI, setStoredToken, clearStoredToken, getStoredToken, getAlertStats, getServerUrl, canConfigureServer, getApiBase } from './services/api';
import Dashboard from './pages/Dashboard';
import RiskMap from './pages/RiskMap';
import Alerts from './pages/Alerts';
import Reports from './pages/Reports';
import StationDetail from './pages/StationDetail';
import Simulator from './pages/Simulator';
import SatelliteData from './pages/SatelliteData';
import DemoFlow from './pages/DemoFlow';
import FloodData from './pages/FloodData';
import Stations from './pages/Stations';
import LandingPage from './pages/LandingPage';
import ErrorBoundary from './components/ErrorBoundary';
import MobileFAB from './components/MobileFAB';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import ThemeToggle from './components/ThemeToggle';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Badge } from './components/ui/badge';
import { Card } from './components/ui/card';
import {
  LayoutDashboard, Map, AlertTriangle, FileText, Globe, Shield, Radio,
  ChevronLeft, Clock, LogOut, User, Bell, Search, Activity, Mountain,
  Droplets, BarChart3, Settings, Home, TrendingUp, Building2, MapPin, Zap, Satellite, Rocket, Waves,
  Server, KeyRound, Sparkles, CheckCircle2, ChevronDown, ChevronUp
} from 'lucide-react';

interface AuthContextType {
  isLoggedIn: boolean;
  user: { name: string; role: string } | null;
  login: (name: string, role: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  user: null,
  login: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  const [serverInput, setServerInput] = useState('');
  const [showServerSettings, setShowServerSettings] = useState(false);
  const allowServerOverride = canConfigureServer();

  useEffect(() => {
    const saved = getServerUrl();
    setApiUrl(getApiBase());
    setServerInput(saved || '');
    setShowServerSettings(false);
  }, []);

  const connectToServer = (server: string) => {
    const raw = server.trim();
    if (!raw) return;
    let url = raw.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!url.includes(':')) url += ':8000';
    localStorage.setItem('trinetra_server_url', url);
    const newApiUrl = `http://${url}/api`;
    setApiUrl(newApiUrl);
    setShowServerSettings(false);
    setError('');
  };

  const saveServerUrl = () => connectToServer(serverInput);

  const clearServerUrl = () => {
    localStorage.removeItem('trinetra_server_url');
    setServerInput('');
    setApiUrl(getApiBase());
    setShowServerSettings(true);
    setError('Server URL cleared. Please enter a new one above.');
  };

  const detectServer = async () => {
    setLoading(true);
    setError('');
    const candidates = [
      'localhost:8000',
      '127.0.0.1:8000',
      '10.139.21.12:8000',
      '10.123.230.162:8000',
      '10.0.2.2:8000',
      '192.168.1.1:8000',
      '192.168.1.100:8000',
      '192.168.0.1:8000',
      '192.168.0.100:8000',
      '172.16.0.1:8000',
    ];
    
    for (const candidate of candidates) {
      try {
        const testUrl = `http://${candidate}/api/health`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(testUrl, { signal: controller.signal, mode: 'cors' });
        clearTimeout(timeoutId);
        if (res.ok) {
          setServerInput(candidate);
          connectToServer(candidate);
          setError(`Connected to server at ${candidate}`);
          setLoading(false);
          return;
        }
      } catch (e) {
        // try next
      }
    }
    
    setError('Auto-detect failed. Please enter server IP manually below.');
    setShowServerSettings(true);
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (!email || !password) {
      setError(t('enterCredentials'));
      setLoading(false);
      return;
    }
    try {
      const res = await loginAPI(email, password);
      setStoredToken(res.data.token);
      login(res.data.user.name, res.data.user.role);
      navigate('/');
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      const currentApiUrl = getApiBase();
      const isNetworkError = !err.response || status === 0 || status === undefined || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ERR_NETWORK';
      if (isNetworkError) {
        const nextStep = allowServerOverride
          ? 'Check the network or update the server address above.'
          : 'The hosted API is unavailable. Please retry shortly.';
        setError(`Cannot reach backend at ${currentApiUrl}. ${nextStep}`);
      } else if (status === 401) {
        setError(detail || 'Invalid email or password');
      } else {
        setError(detail || `Login failed (HTTP ${status || 'error'})`);
      }
      console.error('Login error:', err);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dot-grid flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background soft sky blue ambient blur circles */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-200/50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-300/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-3/4 left-1/3 w-64 h-64 bg-emerald-200/30 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md animate-scale-in">
        <Card className="bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-xl shadow-sky-950/5 rounded-3xl p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-md border border-slate-200/90 overflow-hidden mb-3">
              <img src="/trinetra_logo.png" alt="Tri-Netra" className="w-full h-full object-contain p-1" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tri-Netra</h1>
            <p className="text-xs text-slate-500 font-medium mt-1">AI-Powered Landslide Early Warning System</p>
            <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full bg-sky-50 border border-sky-200/60 text-sky-700 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
              North Eastern Region • Smart India Hackathon
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="text-xs rounded-xl px-3.5 py-2.5 bg-rose-50 border border-rose-200 text-rose-700 font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-500" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            {/* Local server selection is only relevant to Electron/mobile clients. */}
            {allowServerOverride && (
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => setShowServerSettings(!showServerSettings)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100/60 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-sky-600" />
                    Server Connection ({apiUrl})
                  </span>
                  {showServerSettings ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                </button>

                {showServerSettings && (
                  <div className="p-3 border-t border-slate-200/60 space-y-2">
                    <Input
                      type="text"
                      value={serverInput}
                      onChange={(e) => setServerInput(e.target.value)}
                      placeholder="e.g. localhost:8000 or 10.0.2.2:8000"
                      className="h-8 text-xs"
                    />
                    <div className="flex gap-1.5">
                      <Button type="button" size="sm" variant="sky" onClick={saveServerUrl} className="flex-1 text-[11px]">
                        Save & Connect
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={detectServer} disabled={loading} className="flex-1 text-[11px]">
                        Auto-detect
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={clearServerUrl} className="text-[11px] text-slate-500 hover:text-rose-600">
                        Clear
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">{t('emailLabel')}</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@trinetra.gov.in"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">{t('passwordLabel')}</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm shadow-md shadow-sky-600/20 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <KeyRound className="w-4 h-4 mr-2" />
                  {t('signInToTriNetra')}
                </>
              )}
            </Button>
          </form>

          {/* Quick demo credentials are excluded from ordinary production builds. */}
          {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true') && (
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-[11px] font-medium text-slate-500 text-center mb-2.5">
              ⚡ Quick Demo Credentials
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { email: 'admin@trinetra.gov.in', password: 'admin123', label: 'Admin', role: 'System Admin' },
                { email: 'field@trinetra.gov.in', password: 'field123', label: 'Field Officer', role: 'Telemetry' },
                { email: 'district@trinetra.gov.in', password: 'district123', label: 'District Admin', role: 'Disaster Ops' },
                { email: 'citizen@trinetra.gov.in', password: 'demo123', label: 'Citizen', role: 'Public Access' },
              ].map((demo) => (
                <button
                  key={demo.email}
                  type="button"
                  onClick={() => { setEmail(demo.email); setPassword(demo.password); }}
                  className="flex flex-col text-left px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-sky-300 hover:bg-sky-50/60 transition-all group"
                >
                  <span className="text-xs font-semibold text-slate-800 group-hover:text-sky-700">{demo.label}</span>
                  <span className="text-[10px] text-slate-500">{demo.role}</span>
                </button>
              ))}
            </div>
          </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function MainLayout() {
  const [lang, setLangState] = useState<Language>(getCurrentLanguage());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeAlerts, setActiveAlerts] = useState(0);
  const [serverUrl, setServerUrlState] = useState(getServerUrl());
  const { user, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const fetchAlertCount = async () => {
      try {
        const res = await getAlertStats();
        setActiveAlerts(res.data.active);
      } catch { /* ignore */ }
    };
    fetchAlertCount();
    const interval = setInterval(fetchAlertCount, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleLangChange = (newLang: Language) => {
    setLangState(newLang);
    setLanguage(newLang);
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('dashboard'), badge: null },
    { to: '/map', icon: Map, label: t('map'), badge: null },
    { to: '/alerts', icon: AlertTriangle, label: t('alerts'), badge: activeAlerts > 0 ? activeAlerts : null },
    { to: '/reports', icon: FileText, label: t('reports'), badge: null },
    { to: '/stations', icon: Radio, label: t('stations'), badge: null },
    { to: '/simulator', icon: Zap, label: t('simulateLandslide'), badge: null },
    { to: '/satellite', icon: Satellite, label: t('satellite'), badge: null },
    { to: '/flood', icon: Waves, label: t('floodRisk'), badge: null },
    { to: '/demo', icon: Rocket, label: t('demoFlow'), badge: null },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50/80 dark:bg-black text-slate-900 dark:text-white font-sans">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 md:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 fixed inset-y-0 left-0 z-50 md:relative md:z-auto transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-[72px]'
        } bg-white dark:bg-zinc-950/95 dark:backdrop-blur-2xl border-r border-slate-200/80 dark:border-white/10 flex flex-col flex-shrink-0 shadow-sm`}
      >
        {/* Brand / Logo */}
        <div className="p-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 overflow-hidden flex items-center justify-center shadow-xs flex-shrink-0">
              <img src="/trinetra_logo.png" alt="Tri-Netra" className="w-full h-full object-contain" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-base font-bold text-slate-900 dark:text-white truncate">Tri-Netra</h1>
                  <Badge variant="sky" size="sm" className="text-[9px] px-1.5 py-0 font-bold uppercase tracking-wider">
                    {t('aiBadge')}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-400 truncate font-medium">{t('panIndiaSubtitle')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Live Status Pill */}
        <div className={`px-3.5 py-2.5 border-b border-slate-100 dark:border-white/10 ${!sidebarOpen ? 'px-2' : ''}`}>
          <div className={`flex items-center gap-2 ${sidebarOpen ? '' : 'justify-center'}`}>
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
            </span>
            {sidebarOpen && (
              <div className="flex items-center justify-between flex-1 min-w-0">
                <span className="text-[11px] text-sky-700 dark:text-sky-300 font-semibold tracking-wide uppercase truncate">
                  {t('liveMonitoring')}
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Healthy telemetry" />
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-3 space-y-1 px-2 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 group relative select-none ${
                  isActive
                    ? 'bg-sky-50 dark:bg-white/10 text-sky-700 dark:text-white font-semibold border-r-2 border-sky-600 dark:border-white shadow-sm dark:shadow-black/50'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5 border-r-2 border-transparent'
                } ${!sidebarOpen ? 'justify-center px-0' : ''}`
              }
              title={!sidebarOpen ? item.label : undefined}
            >
              <div className="relative shrink-0 flex items-center justify-center">
                <item.icon className="w-4 h-4 transition-transform group-hover:scale-110" />
                {item.badge && !sidebarOpen && (
                  <span className="absolute -top-1.5 -right-2 px-1 py-0.2 rounded-full bg-rose-500 text-white text-[8px] font-bold shadow-xs">
                    {item.badge}
                  </span>
                )}
              </div>
              {sidebarOpen && <span className="truncate">{item.label}</span>}
              {item.badge && sidebarOpen && (
                <span className="ml-auto px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold min-w-[18px] text-center shadow-xs shrink-0">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Quick Station Status in Sidebar */}
        {sidebarOpen && (
          <div className="px-3 py-2.5 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-zinc-950/40">
            <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mb-1.5 px-1">
              {t('quickStations')}
            </p>
            <div className="space-y-1">
              {[
                { name: 'Gangtok', risk: 'moderate', id: 'NER-001' },
                { name: 'Cherrapunji', risk: 'high', id: 'NER-011' },
                { name: 'Imphal', risk: 'moderate', id: 'NER-006' },
              ].map((s) => (
                <NavLink
                  key={s.id}
                  to={`/station/${s.id}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-2 py-1.5 rounded-lg text-xs text-slate-600 dark:text-zinc-400 hover:bg-white dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white hover:shadow-xs transition-all"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      s.risk === 'high' ? 'bg-rose-500' : s.risk === 'moderate' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`} />
                    <span className="truncate">{s.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">{s.id}</span>
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {/* Language & Settings */}
        <div className={`p-3 border-t border-slate-100 dark:border-white/10 bg-white dark:bg-zinc-950/40 ${!sidebarOpen ? 'p-2' : ''}`}>
          {sidebarOpen ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Globe className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                  {t('settings')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {(Object.entries(languages) as [Language, { name: string; flag: string }][]).map(
                  ([code, { name, flag }]) => (
                    <button
                      key={code}
                      onClick={() => handleLangChange(code)}
                      className={`text-[11px] px-2 py-1 rounded-lg transition-all text-left truncate flex items-center gap-1.5 ${
                        lang === code
                          ? 'bg-sky-50 dark:bg-white/15 text-sky-700 dark:text-white font-semibold border border-sky-200/80 dark:border-white/20 shadow-xs'
                          : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span className="shrink-0">{flag}</span>
                      <span className="truncate">{name}</span>
                    </button>
                  )
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-full flex justify-center text-slate-500 hover:text-sky-600 p-1.5 rounded-lg hover:bg-slate-50"
              title="Settings"
            >
              <Globe className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* User Profile & Collapse */}
        <div className="border-t border-slate-100 dark:border-white/10 p-2 bg-slate-50/50 dark:bg-zinc-950/60">
          {sidebarOpen && user && (
            <div className="p-2 rounded-xl bg-white dark:bg-zinc-900/80 border border-slate-200/70 dark:border-white/10 flex items-center gap-2.5 mb-2 shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-sky-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-xs">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{user.name}</p>
                <p className="text-[10px] text-slate-400 capitalize truncate font-medium">{user.role.replace('_', ' ')}</p>
              </div>
              <button
                onClick={logout}
                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-all shrink-0"
                title={t('logout')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full py-1.5 px-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-all flex items-center justify-center text-xs gap-1 font-medium"
          >
            <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${sidebarOpen ? '' : 'rotate-180'}`} />
            {sidebarOpen && <span className="text-[11px] truncate">{t('collapseSidebar')}</span>}
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/60 dark:bg-black min-w-0">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-zinc-950/80 backdrop-blur-xl flex items-center justify-between px-3 sm:px-6 flex-shrink-0 z-10 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 dark:bg-zinc-900/90 border border-sky-200/80 dark:border-white/15 text-sky-700 dark:text-white text-xs font-semibold shrink-0 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
              <span>{t('liveTelemetry')}</span>
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium hidden lg:inline truncate">
              {t('panIndiaSubtitle')}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Alert Counter */}
            <NavLink
              to="/alerts"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/80 dark:bg-zinc-900/90 hover:bg-slate-200/70 dark:hover:bg-zinc-800 border border-transparent dark:border-white/10 text-slate-700 dark:text-zinc-200 text-xs font-medium transition-colors shadow-xs"
            >
              <Bell className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-300" />
              {activeAlerts > 0 ? (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                  {activeAlerts}
                </span>
              ) : (
                <span className="text-slate-500 text-[11px] hidden sm:inline">0 Active</span>
              )}
            </NavLink>

            {/* Time Clock */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-zinc-900/90 border border-slate-200/70 dark:border-white/10 text-slate-700 dark:text-zinc-200 text-xs font-mono font-medium shadow-xs">
              <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-white" />
              <span className="hidden sm:inline">
                {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </span>
              <span className="sm:hidden">
                {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </span>
            </div>

            {/* Glossy Theme Toggle Button */}
            <ThemeToggle />

            {/* Hackathon Event Badge */}
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 dark:from-zinc-900 dark:to-zinc-950 border border-sky-200/80 dark:border-white/10 text-sky-700 dark:text-zinc-200 text-xs font-semibold shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-white" />
              <span>SIH 2026</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className={`flex-1 min-w-0 ${location.pathname === '/map' ? 'p-0 overflow-hidden flex flex-col' : 'overflow-y-auto bg-slate-50/50 dark:bg-black p-3.5 sm:p-5 lg:p-6'}`}>
          <Routes key={lang}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/map" element={<RiskMap />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/stations" element={<Stations />} />
            <Route path="/station/:stationId" element={<StationDetail />} />
            <Route path="/simulator" element={<Simulator />} />
            <Route path="/satellite" element={<SatelliteData />} />
            <Route path="/flood" element={<FloodData />} />
            <Route path="/demo" element={<DemoFlow />} />
          </Routes>
        </main>
      </div>

      {/* Mobile Floating Action Button */}
      <MobileFAB />
    </div>
  );
}

function AppRouteGate() {
  const { isLoggedIn } = useAuth();
  const location = useLocation();

  if (location.pathname === '/welcome') {
    return <LandingPage />;
  }

  return isLoggedIn ? <MainLayout /> : <LoginPage />;
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          setUser({ name: payload.name, role: payload.role });
          setIsLoggedIn(true);
        } else {
          clearStoredToken();
        }
      } catch {
        clearStoredToken();
      }
    }
  }, []);

  const login = (name: string, role: string) => {
    setIsLoggedIn(true);
    setUser({ name, role });
  };

  const logout = () => {
    clearStoredToken();
    setIsLoggedIn(false);
    setUser(null);
  };

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthContext.Provider value={{ isLoggedIn, user, login, logout }}>
          <Router>
            <AppRouteGate />
          </Router>
        </AuthContext.Provider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
