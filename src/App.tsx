import { useState, useEffect } from 'react';
import ConfigWindow from './windows/config/ConfigWindow';
import SightlineBarWindow from './windows/sightlineBar/SightlineBarWindow';
import BorderOverlay from './windows/borderOverlay/BorderOverlay';

function App() {
  const [windowType, setWindowType] = useState<'config' | 'sightlineBar' | 'borderOverlay'>('config');

  useEffect(() => {
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

  if (windowType === 'borderOverlay') return <BorderOverlay />;
  if (windowType === 'sightlineBar') return <SightlineBarWindow />;
  return <ConfigWindow />;
}

export default App;
