// src/config.js
import axios from 'axios';

export const API_BASE = `http://${window.location.hostname}:5001`;
export const WS_BASE = `ws://${window.location.hostname}:5001`;

axios.defaults.withCredentials = true;
axios.defaults.timeout = 15000;
