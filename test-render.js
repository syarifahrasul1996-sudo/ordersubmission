import React from 'react';
import { renderToString } from 'react-dom/server';
import { AppProvider } from './src/AppContext.js';
import App from './src/App.js';

console.log(renderToString(React.createElement(AppProvider, null, React.createElement(App))));
