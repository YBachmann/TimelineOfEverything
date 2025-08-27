import React from 'react';
import Timeline from './components/Timeline';
import './index.css';

export default function App() {
  return (
    <main className="container">
      <h1>My interactive timeline</h1>
      <p className="sub">Data source: <code>public/events.json</code></p>
      <Timeline />
    </main>
  );
}
