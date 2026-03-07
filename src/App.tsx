import { useState, useEffect } from 'react';
import ConfigWindow from './windows/config/ConfigWindow';
import SightlineBarWindow from './windows/sightlineBar/SightlineBarWindow';
import BorderOverlay from './windows/borderOverlay/BorderOverlay';

const isElectron = !!window.electron;

function App() {
  const [windowType, setWindowType] = useState<'config' | 'sightlineBar' | 'borderOverlay'>('config');

  useEffect(() => {
    if (!isElectron) return;
    const params = new URLSearchParams(window.location.search);
    const type = params.get('window');
    if (type === 'sightlineBar') {
      setWindowType('sightlineBar');
      document.body.classList.add('transparent-window');
    } else if (type === 'borderOverlay') {
      setWindowType('borderOverlay');
      document.body.classList.add('transparent-window');
    } else {
      setWindowType('config');
    }
  }, []);

  // This app requires the Electron runtime — block browser access
  if (!isElectron) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui', textAlign: 'center', padding: '2rem' }}>
        <div>
          <h1>Desktop App Only</h1>
          <p>This application requires the Thea desktop app. Please download it to continue.</p>
        </div>
      </div>
    );
  }

  if (windowType === 'borderOverlay') return <BorderOverlay />;
  if (windowType === 'sightlineBar') return <SightlineBarWindow />;
  return <ConfigWindow />;
}

export default App;
