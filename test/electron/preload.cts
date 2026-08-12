import preload = require('electron-ipc-socket/preload');

preload.exposeBridge({
    channel: 'fixture',
    key: 'fixtureBridge',
});
