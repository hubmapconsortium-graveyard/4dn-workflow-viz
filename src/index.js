import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import * as serviceWorker from './serviceWorker';
import WorkflowRunView          from './item-pages/WorkflowRunView';
import WorkflowView             from './item-pages/WorkflowView';

ReactDOM.render(<WorkflowRunView />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
