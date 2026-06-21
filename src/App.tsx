import React, { useState } from 'react';
import { AppProvider, useAppContext } from './AppContext';
import { Header } from './components/Header';
import { ViewSection } from './components/ViewSection';
import { Toast } from './components/Toast';
import { FloatingControls } from './components/FloatingControls';

// Statically import views to guarantee smooth navigation and prevent dynamic import chunk loading failures
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

