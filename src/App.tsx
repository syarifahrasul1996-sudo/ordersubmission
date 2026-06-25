import React, { useState, Suspense } from 'react';
import { AppProvider, useAppContext } from './AppContext';
import { Header } from './components/Header';
import { ViewSection } from './components/ViewSection';
import { Toast } from './components/Toast';
import { FloatingControls } from './components/FloatingControls';

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
    <div className="flex justify-center w-full select-none bg-[#F2F2F7] dark:bg-[#000000] h-[100dvh] overflow-hidden">
      <div className="w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl md:flex-row bg-background h-full flex flex-col relative md:shadow-2xl overflow-hidden text-base md:border-x md:border-gray-200 dark:md:border-zinc-800">
        
        <div className="hidden md:flex flex-col w-64 lg:w-72 bg-surface border-r border-gray-100 dark:border-zinc-800 shrink-0 h-full overflow-y-auto z-10 relative">
          <DesktopSidebar />
        </div>

        <div className="flex-1 flex flex-col h-full overflow-hidden relative w-full bg-gray-50/50 dark:bg-black/20">
          <Header />
          
          <main className="flex-1 overflow-y-auto overflow-x-hidden relative flex justify-center">
            <div className="w-full max-w-4xl min-h-full relative">
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
            </div>
          </main>

          <FloatingControls />
          <div className="md:hidden">
            <BottomNavigation />
          </div>
        </div>
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

