/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'

import { Route, Router } from '@solidjs/router';
import HyperspectralApp from './hyperspectralApp';
import LandingPage from './landingPage';
import MobileGuard from './mobileGuard';
import UnsupportedDevice from './unSupportedDevice';

const wrapper = document.getElementById("root");

if (!wrapper) {
  throw new Error("Wrapper div not found");
}

render(() => (<Router>
  <Route path="/" component={() => (
    <MobileGuard>
      <LandingPage />
    </MobileGuard>)} />
  <Route path="/app" component={HyperspectralApp} />
  <Route path={"/unsupported-device"} component={UnsupportedDevice}/>
</Router>), wrapper);


