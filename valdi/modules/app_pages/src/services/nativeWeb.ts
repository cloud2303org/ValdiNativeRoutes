import { installNativeWeb } from 'native_web/src/NativeWeb';

// app.ts imports this before its services, so their module initializers can
// use fetch, WebSocket, streams, encoding and abort globals immediately.
installNativeWeb();
