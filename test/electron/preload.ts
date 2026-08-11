import { exposeBridge } from '../../dist/preload.js';

exposeBridge({
    channel: 'fixture',
    key: 'fixtureBridge',
});
