import React from 'react';
import { renderToString } from 'react-dom/server';
import { AppProvider } from './src/AppContext';
import App from './src/App';

console.log(renderToString(<App />));
