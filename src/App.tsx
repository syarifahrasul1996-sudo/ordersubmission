import React, { useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { AppProvider, useAppContext } from './AppContext';
import { Header } from './components/Header';
import { ViewSection } from './components/ViewSection';
import { Toast } from './components/Toast';
import { FloatingControls } from './components/FloatingControls';
import { ErrorBoundary } from './components/ErrorBoundary';

import { HomeView } from './views/HomeView';
import { ResumeTypeView } from './views/ResumeTypeView';
import { ResumeFormFieldsView } from './views/ResumeFormFieldsView';
import { GeneralFormView } from './views/GeneralFormView';
import { ConfirmationView } from './views/ConfirmationView';
import { OutputView } from './views/OutputView';
import { HistoryView } from './views/HistoryView';
import { CustomerInfoView } from './views/CustomerInfoView';
import { DashboardView } from './views/DashboardView';
import { ContactsSyncView } from './views/ContactsSyncView';
import { OthersView } from './views/OthersView';

import { BottomNavigation } from './components/BottomNavigation';
import { DesktopSidebar } from './components/DesktopSidebar';

function AppContent() {
  const { viewStack, incomingAlertToast, dismissIncomingAlertToast, appLanguage } = useAppContext();
  const [showToast, setShowToast] = useState(false);

  const handleCopy = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = txt;
      ta.style.position = "fixed";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const currentView = (viewStack && viewStack.length > 0) ? viewStack[viewStack.length - 1] : 'home';

  return (
    <div className="flex justify-center w-full select-none bg-[#F2F2F7] dark:bg-[#000000] h-[100dvh] overflow-hidden md:h-auto md:min-h-screen md:overflow-visible">
      <div className="w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl md:flex-row bg-background h-full md:h-auto md:min-h-screen flex flex-col relative md:shadow-2xl overflow-hidden md:overflow-visible text-base md:border-x md:border-gray-200 dark:md:border-zinc-800">
        
        <div className="hidden md:flex flex-col w-64 lg:w-72 bg-surface border-r border-gray-100 dark:border-zinc-800 shrink-0 md:sticky md:top-0 md:h-screen md:self-start md:overflow-y-auto z-10">
          <DesktopSidebar />
        </div>

        <div className="flex-1 flex flex-col h-full md:h-auto md:min-h-screen md:min-w-0 overflow-hidden md:overflow-visible relative w-full bg-gray-50/50 dark:bg-black/20">
          <Header />
          
          <main className="flex-1 overflow-y-auto md:overflow-visible overflow-x-hidden md:overflow-x-clip relative flex justify-center">
            <div className="w-full max-w-4xl min-h-full relative">
              <ViewSection id="view-home" active={currentView === 'home'}>
                <HomeView />
              </ViewSection>
              
              <ViewSection id="view-resume-type" active={currentView === 'resume-type'}>
                <ResumeTypeView />
              </ViewSection>
              
              <ViewSection id="view-resume-form-fields" active={currentView === 'resume-form-fields'}>
                <ResumeFormFieldsView />
              </ViewSection>
              
              <ViewSection id="view-general-form" active={currentView === 'general-form'}>
                <GeneralFormView />
              </ViewSection>
              
              <ViewSection id="view-confirmation" active={currentView === 'confirmation'}>
                <ConfirmationView onGenerated={() => {}} />
              </ViewSection>
              
              <ViewSection id="view-output" active={currentView === 'output'}>
                <OutputView onCopy={handleCopy} />
              </ViewSection>

              <ViewSection id="view-history" active={currentView === 'history'}>
                <HistoryView />
              </ViewSection>

              <ViewSection id="view-customer-info" active={currentView === 'customer-info'}>
                <CustomerInfoView />
              </ViewSection>

              <ViewSection id="view-dashboard" active={currentView === 'dashboard'}>
                <DashboardView />
              </ViewSection>

              <ViewSection id="view-contacts-sync" active={currentView === 'contacts-sync'}>
                <ContactsSyncView />
              </ViewSection>

              <ViewSection id="view-others" active={currentView === 'others'}>
                <OthersView />
              </ViewSection>
            </div>
          </main>

          <FloatingControls />
          <div className="md:hidden">
            <BottomNavigation />
          </div>
        </div>
      </div>

      {incomingAlertToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] inset-x-3 sm:inset-x-auto sm:right-5 sm:top-5 sm:w-96 z-[95] bg-white dark:bg-zinc-900 border border-emerald-500/30 shadow-2xl rounded-2xl p-3.5 flex items-start space-x-3 animate-fade-in-up"
        >
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
            <BellRing className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-extrabold text-text truncate">
                {incomingAlertToast.title}
              </p>
              {incomingAlertToast.senderDeviceLabel && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                  {appLanguage === 'ms' ? `Dari ${incomingAlertToast.senderDeviceLabel}` : `From ${incomingAlertToast.senderDeviceLabel}`}
                </span>
              )}
            </div>
            <p className="text-[11px] text-subtext leading-snug mt-0.5">
              {incomingAlertToast.body}
            </p>
          </div>
          <button
            type="button"
            onClick={dismissIncomingAlertToast}
            className="p-1 rounded-lg text-subtext hover:text-text hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            aria-label={appLanguage === 'ms' ? 'Tutup' : 'Dismiss'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <Toast show={showToast} message="BERJAYA DISALIN!" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}

