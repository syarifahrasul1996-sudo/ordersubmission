import React, { useState, Suspense, lazy } from 'react';
import { AppProvider, useAppContext } from './AppContext';
import { Header } from './components/Header';
import { ViewSection } from './components/ViewSection';
import { Toast } from './components/Toast';
import { FloatingControls } from './components/FloatingControls';

// Dynamically import views for code splitting
const HomeView = lazy(() => import('./views/HomeView').then(m => ({ default: m.HomeView })));
const ResumeTypeView = lazy(() => import('./views/ResumeTypeView').then(m => ({ default: m.ResumeTypeView })));
const ResumeFormFieldsView = lazy(() => import('./views/ResumeFormFieldsView').then(m => ({ default: m.ResumeFormFieldsView })));
const GeneralFormView = lazy(() => import('./views/GeneralFormView').then(m => ({ default: m.GeneralFormView })));
const ConfirmationView = lazy(() => import('./views/ConfirmationView').then(m => ({ default: m.ConfirmationView })));
const OutputView = lazy(() => import('./views/OutputView').then(m => ({ default: m.OutputView })));
const HistoryView = lazy(() => import('./views/HistoryView').then(m => ({ default: m.HistoryView })));
const CustomerInfoView = lazy(() => import('./views/CustomerInfoView').then(m => ({ default: m.CustomerInfoView })));
const DashboardView = lazy(() => import('./views/DashboardView').then(m => ({ default: m.DashboardView })));
const ContactsSyncView = lazy(() => import('./views/ContactsSyncView').then(m => ({ default: m.ContactsSyncView })));
const OthersView = lazy(() => import('./views/OthersView').then(m => ({ default: m.OthersView })));

import { BottomNavigation } from './components/BottomNavigation';


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
    <div className="flex justify-center w-full select-none bg-black/5 dark:bg-black/40 h-[100dvh] overflow-hidden">
      <div className="w-full max-w-[500px] bg-background h-full flex flex-col relative shadow-2xl overflow-hidden text-base">
        <Header />
        
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
          <Suspense fallback={<div className="p-4 text-center">Loading...</div>}>
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
          </Suspense>
        </main>

        <FloatingControls />
        <BottomNavigation />
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

