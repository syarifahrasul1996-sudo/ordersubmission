import React, { useState, Suspense, lazy } from 'react';
import { AppProvider, useAppContext } from './AppContext';
import { Header } from './components/Header';
import { ViewSection } from './components/ViewSection';
import { Toast } from './components/Toast';
import { FloatingControls } from './components/FloatingControls';

// Lazy load views to improve initial load time
const HomeView = lazy(() => import('./views/HomeView').then(module => ({ default: module.HomeView })));
const ResumeTypeView = lazy(() => import('./views/ResumeTypeView').then(module => ({ default: module.ResumeTypeView })));
const ResumeFormFieldsView = lazy(() => import('./views/ResumeFormFieldsView').then(module => ({ default: module.ResumeFormFieldsView })));
const GeneralFormView = lazy(() => import('./views/GeneralFormView').then(module => ({ default: module.GeneralFormView })));
const ConfirmationView = lazy(() => import('./views/ConfirmationView').then(module => ({ default: module.ConfirmationView })));
const OutputView = lazy(() => import('./views/OutputView').then(module => ({ default: module.OutputView })));
const HistoryView = lazy(() => import('./views/HistoryView').then(module => ({ default: module.HistoryView })));
const CustomerInfoView = lazy(() => import('./views/CustomerInfoView').then(module => ({ default: module.CustomerInfoView })));
const DashboardView = lazy(() => import('./views/DashboardView').then(module => ({ default: module.DashboardView })));

// Loading fallback for Suspense
const ViewLoader = () => (
  <div className="flex items-center justify-center p-8 text-subtext">
    <div className="w-8 h-8 rounded-full border-4 border-surface border-t-primary animate-spin"></div>
  </div>
);

function AppContent() {
  const { viewStack } = useAppContext();
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

  const currentView = viewStack[viewStack.length - 1];

  return (
    <div className="flex justify-center w-full select-none bg-black/5 dark:bg-black/40 min-h-[100dvh]">
      <div className="w-full max-w-[500px] bg-background min-h-[100dvh] flex flex-col relative shadow-2xl overflow-hidden text-[15px]">
        <Header />
        
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
          <Suspense fallback={<ViewLoader />}>
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
          </Suspense>
        </main>

        <FloatingControls />
      </div>
      <Toast show={showToast} message="BERJAYA DISALIN!" />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

