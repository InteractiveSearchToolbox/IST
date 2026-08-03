# InteractiveSearchToolbox
The Interactive Search Toolbox is a JavaScript library for creating and running computer-based interactive search experiments. The toolbox works in tandem with the open-source JavaScript libraries [Three.js](https://threejs.org/), [jsPsych](https://www.jspsych.org/latest/), and [lodash](https://lodash.com/) to simplify creating virtual interactive search experiments capable of recording and storing large quantities of moment-to-moment interactive data packaged into standard experimental psychology frameworks. 
![logo](IST.svg)

## Installation
Option 1 - Include library and css sheet via CDN.
```html
<head>
    <script src="https://cdn.jsdelivr.net/gh/InteractiveSearchToolbox/IST/build/IST.min.js"></script>
    <link href="https://cdn.jsdelivr.net/gh/InteractiveSearchToolbox/IST/build/IST.min.css" rel="stylesheet" type="text/css"/>
</head>
```

Option 2 - Download files to local directory and include these within your own project
- IST - [here](https://cdn.jsdelivr.net/gh/InteractiveSearchToolbox/IST/build/IST.min.js)
- IST CSS - [here](https://cdn.jsdelivr.net/gh/InteractiveSearchToolbox/IST/build/IST.min.css)

## Usage
Add the class into your javascript file once at the top of your file and initiate it using ```.init()```.

The IST dynamically imports other libraries at run time. As such, you must waitfor ```init()``` to complete.
There are two ways to do this. 
- Option 1: use the ```await``` keyword 
```js
// Option 1
const IST = new InteractiveSearchToolbox({enableAmbientLighting: true });
await IST.init();

// Rest of the experiment goes here...
```
- Option 2: Use the .then() syntax.
```js
// Option 2
const IST = new InteractiveSearchToolbox({enableAmbientLighting: true });   
IST.init().then(function(){
    // Rest of the experiment goes here...
});
```



## API / Documentation
Brief reference or link to fuller docs.


## License