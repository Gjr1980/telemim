import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// ── Sentry (carregamento opcional via CDN) ──────────────────────────────────
var SENTRY_DSN = (typeof window !== 'undefined' && window.__SENTRY_DSN__) || '';
if (SENTRY_DSN) {
  var s = document.createElement('script');
  s.src = 'https://browser.sentry-cdn.com/8.0.0/bundle.replay.min.js';
  s.crossOrigin = 'anonymous';
  s.onload = function() {
    if (window.Sentry) {
      window.Sentry.init({
        dsn: SENTRY_DSN,
        environment: location.hostname.includes('localhost') ? 'dev' : 'production',
        release: 'telemim@' + (window.__APP_VERSION__ || 'unknown'),
        tracesSampleRate: 0.1,
        integrations: window.Sentry.replayIntegration ? [window.Sentry.replayIntegration()] : [],
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
        beforeSend: function(event) {
          if (event.user) { delete event.user.email; delete event.user.ip_address; }
          return event;
        }
      });
    }
  };
  document.head.appendChild(s);
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null, showDetails: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error: error };
  }
  componentDidCatch(error, info) {
    this.setState({ info: info });
    console.error('[Promorar ErrorBoundary]', error, info);
    if (typeof window !== 'undefined' && window.Sentry) {
      try { window.Sentry.captureException(error, { extra: { componentStack: info && info.componentStack } }); } catch (e) {}
    }
    try {
      var stack = (error && error.stack) ? error.stack.substring(0, 1500) : '';
      var componentStack = (info && info.componentStack) ? info.componentStack.substring(0, 1000) : '';
      fetch('https://netoufukpmmfhzwirogi.supabase.co/rest/v1/auditoria', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ldG91ZnVrcG1tZmh6d2lyb2dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTkwOTksImV4cCI6MjA4OTg5NTA5OX0.iapL70SiL_GV4XvmXRNcjlK_Sc-P2-esJzuLQvovdGQ',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          acao: 'frontend_error',
          detalhes: { mensagem: String(error && error.message || error), stack: stack, componente: componentStack, url: window.location.href, ua: navigator.userAgent }
        })
      }).catch(function(){});
    } catch (e) {}
  }
  render() {
    if (this.state.hasError) {
      var self = this;
      return React.createElement('div', { style: { minHeight: '100vh', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif' } },
        React.createElement('div', { style: { background: '#fff', borderRadius: 20, padding: '30px 24px', maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', textAlign: 'center' } },
          React.createElement('div', { style: { fontSize: 56, marginBottom: 12 } }, '⚠️'),
          React.createElement('div', { style: { fontSize: 20, fontWeight: 900, color: '#1e293b', marginBottom: 8 } }, 'Algo deu errado'),
          React.createElement('div', { style: { fontSize: 14, color: '#64748b', marginBottom: 24, lineHeight: 1.5 } }, 'Encontramos um problema inesperado. Por favor, recarregue o app para continuar.'),
          React.createElement('button', { onClick: function() { location.reload(); }, style: { width: '100%', padding: '14px 0', background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 12px rgba(124,58,237,0.35)' } }, '🔄 Recarregar Telemim'),
          React.createElement('button', { onClick: function() { self.setState({ showDetails: !self.state.showDetails }); }, style: { marginTop: 12, padding: '8px 16px', background: 'transparent', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 600, fontSize: 11, cursor: 'pointer' } }, self.state.showDetails ? 'Ocultar detalhes técnicos' : 'Ver detalhes técnicos'),
          self.state.showDetails && React.createElement('div', { style: { marginTop: 16, padding: 12, background: '#f8fafc', borderRadius: 8, fontFamily: 'monospace', fontSize: 10, color: '#475569', textAlign: 'left', maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', border: '1px solid #e2e8f0' } },
            String(self.state.error),
            self.state.info && self.state.info.componentStack ? '\n\n' + self.state.info.componentStack : ''
          )
        )
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(ErrorBoundary, null,
    React.createElement(React.StrictMode, null,
      React.createElement(App, null)
    )
  )
)

// ── PWA Install Banner ──────────────────────────────────────────
(function setupInstallBanner() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  var lastDismiss = parseInt(localStorage.getItem('pwa_install_dismissed') || '0', 10);
  if (lastDismiss && (Date.now() - lastDismiss) < 7 * 24 * 60 * 60 * 1000) return;
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(showBanner, 30000);
  });
  function showBanner() {
    if (!deferredPrompt) return;
    if (document.getElementById('pwa-install-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#fff;border:4px solid #1e3a8a;border-radius:24px;padding:24px 24px 20px;box-shadow:0 20px 60px rgba(0,0,0,0.45);z-index:99999;display:flex;flex-direction:column;gap:18px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:520px;width:calc(100vw - 16px);animation:slideUp .3s ease;';
    banner.innerHTML = '<button id="pwa-install-no" style="position:absolute;top:10px;right:12px;background:#f1f5f9;border:none;color:#64748b;font-size:22px;cursor:pointer;width:36px;height:36px;border-radius:50%;line-height:1;display:flex;align-items:center;justify-content:center;font-weight:700">✕</button><div style="display:flex;align-items:center;gap:18px;padding-right:40px"><div style="font-size:72px;line-height:1">📱</div><div style="flex:1;min-width:0"><div style="font-size:22px;font-weight:900;color:#1e3a8a;line-height:1.15">Instalar TELEMIM no celular</div><div style="font-size:16px;color:#334155;margin-top:8px;line-height:1.35;font-weight:500">Acesso rápido, funciona offline e parece app nativo</div></div></div><button id="pwa-install-yes" style="width:100%;padding:18px 20px;background:linear-gradient(135deg,#7c3aed,#1e3a8a);color:#fff;border:none;border-radius:14px;font-weight:900;font-size:18px;cursor:pointer;box-shadow:0 6px 18px rgba(30,58,138,0.5);letter-spacing:0.3px">📥 Instalar agora</button>';
    var style = document.createElement('style');
    style.textContent = '@keyframes slideUp{from{transform:translate(-50%,100px);opacity:0}to{transform:translate(-50%,0);opacity:1}}';
    document.head.appendChild(style);
    document.body.appendChild(banner);
    document.getElementById('pwa-install-yes').onclick = async function() {
      banner.remove();
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) {}
      deferredPrompt = null;
    };
    document.getElementById('pwa-install-no').onclick = function() {
      banner.remove();
      localStorage.setItem('pwa_install_dismissed', String(Date.now()));
    };
  }
  window.addEventListener('appinstalled', function() {
    var el = document.getElementById('pwa-install-banner');
    if (el) el.remove();
    localStorage.setItem('pwa_install_dismissed', String(Date.now()));
  });
})();

// PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')
      .then(function(reg) {
        console.log('[SW] registrado', reg.scope);
        setInterval(function(){ reg.update().catch(function(){}); }, 60 * 60 * 1000);
      })
      .catch(function(e) { console.warn('[SW] erro', e); });
  });
}
