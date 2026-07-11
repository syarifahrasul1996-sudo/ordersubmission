import React from 'react';
import { renderToString } from 'react-dom/server';
import { AppProvider } from './src/AppContext';
import { DashboardView } from './src/views/DashboardView';

console.log(renderToString(
  <AppProvider>
    <DashboardView />
  </AppProvider>
));
