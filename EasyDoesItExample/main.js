// For the sake of this example, we will enable some quick ambient lighting
const IST = new InteractiveSearchToolbox({ enableAmbientLighting: true })

// Before doing any other processing, we turn on the loading screen
IST.turnOnLoadingScreen("Loading...")

// Change the ambient light intensity
IST.ambientLight.intensity = 10

// Setup some basic variables which we will use throughout
const timeline = []; // JsPsych timeline
const distractors = [] // Array to hold our distractor stimuli
const targets = [] // Array to hold our target stimuli
const trialTypes = _.shuffle(['PRESENT_INNER_HIGH', 'PRESENT_INNER_LOW', 'PRESENT_OUTER_HIGH', 'PRESENT_OUTER_LOW', 'ABSENT_INNER', 'ABSENT_OUTER', 'ABSENT_INNER', 'ABSENT_OUTER']) // Array for our trial types
let currentTrialCount = 0 // Counter to know which trial we are on

// HANDLE COLOURS OF OBJECTS 
// In the study, we use specific colours that are predetermined distance from eachother in colour space
const colourList = ['#F0AA02', '#D7C300', '#EBEB00', '#BED200', '#78BE00', '#3CC85A', '#3C966E', '#30AAAB', '#35A5EB', '#2D78EB', '#6E3BC8', '#B432B4', '#EB00AA', '#F50A64', '#F73232', '#FF643C']

// Randomly select the first colour, then the second colour is always 7 steps away from the first
const firstValue = _.random(0, 15, false);
let secondValue = firstValue + 7;

// If we reach the end of our colour list, we wrap back around to the start
if (secondValue > 15) {
    secondValue = 0 + (secondValue % 15)
}

// Use those values to create a simple array with two hex codes in for our colours
const colourSelection = [colourList[firstValue], colourList[secondValue]];


// PRELOADING
// Now we can begin by loading in our stimuli - note that for the sake of quicker loading, we only load two stimuli - we can copy these master stimuli and change their appearence at runtime instead
IST.preLoadModels([
    'Models/TARGET_CUBE.glb',
    'Models/DISTRACTOR_CUBE.glb'
])

// We also load in a HDRI file for some quick and easy lighting
IST.preloadHDRI(['Textures/smallStudio.hdr'], true) // Setting the second arguement to true automatically applies the HDRI to our scene.

// PRELOAD FINISHED
// Due to the asynchronous nature of loading files, we use the onPreloadFinished callback to ensure we only begin doing things AFTER the models, HDRIs and any other textures we need have loaded
IST.onPreloadFinished(function () {

    IST.enableDataCollection({ realTimeTracking: true }); // Allow us to easily record interaction data

    IST.addGlobalData("DATE", new Date().toUTCString()) // Using addGlobalData to add a date stamp to our data file - this could be whatever data you wanted though

    // Enable the interactive controls
    IST.enableDragToRotateControls(
        {
            varySensitivity: true,
            sensitivityFlags: {
                "HIGH": 34, // Any objects that have the text HIGH in their name will have a reduced sensitivity of 34% (relative to the overall sensitivity)
                "LOW": 100
            }
        });

    // PROCESS OUR UPLOADED GLB FILES
    // Inside this function, we will create the stimuli we need for each trial - this will be called once at the start of the experiment.
    // We will clone the master objects that we uploaded, rename them, and change their colour to the values we chose earlier
    function setupStimuli() {
        // Create 4 distractor cubes and make half of them low effort and half high effort
        for (let i = 0; i < 4; i++) {
            const cloned_cube = IST.findLoadedObject('DISTRACTOR_CUBE').clone()
            cloned_cube.name = "DISTRACTOR_CUBE_LOW_1"

            if (i < 2) {
                const newName = "DISTRACTOR_CUBE_LOW_" + (i + 1)
                cloned_cube.name = newName

            } else {
                const newName = "DISTRACTOR_CUBE_HIGH_" + ((i + 1) - 2)
                cloned_cube.name = newName
            }

            // Next we change the colour of the cubes whilst leaving the T and L shapes unchanged.
            // Traverse loops through all items within the three.js object
            cloned_cube.traverse((o) => {
                // Go through all items, if the selected item is a mesh...
                if (o.isMesh) {
                    // If the mesh we're inspecting includes the name BASE, it is the one we want (we named this back in Blender)
                    if (o.name.includes("BASE")) {
                        // If the cloned object we're working with is high effort, we assign it colour 1 from the colours we picked earlier, else we assign it colour 2.
                        if (cloned_cube.name.includes("HIGH")) {
                            o.material = new THREE.MeshStandardMaterial({ color: colourSelection[0] })
                        } else {
                            o.material = new THREE.MeshStandardMaterial({ color: colourSelection[1] })
                        }
                    }
                }
            });

            // Distractor cube is now made, so save it to our distractors array.
            distractors.push(cloned_cube)
        }

        // Create 2 target cubes and make one of them low effort and one of them high effort
        for (let i = 0; i < 2; i++) {
            const cloned_target_cube = IST.findLoadedObject('TARGET_CUBE').clone()

            if (i == 0) {
                cloned_target_cube.name = "TARGET_CUBE_LOW_1"
            } else {
                cloned_target_cube.name = "TARGET_CUBE_HIGH_1"
            }

            // Next we change the colour of the cubes whilst leaving the T and L shapes unchanged.
            // Traverse loops through all items within the three.js object
            cloned_target_cube.traverse((o) => {
                // Go through all items, if the selected item is a mesh...
                if (o.isMesh) {
                    // If the mesh we're inspecting includes the name BASE, it is the one we want (we named this back in Blender)
                    if (o.name.includes("BASE")) {
                        // If the cloned object we're working with is high effort, we assign it colour 1 from the colours we picked earlier, else we assign it colour 2.
                        if (cloned_target_cube.name.includes("HIGH")) {
                            o.material = new THREE.MeshStandardMaterial({ color: colourSelection[0] })
                        } else {
                            o.material = new THREE.MeshStandardMaterial({ color: colourSelection[1] })
                        }
                    }
                }
            });

            // Target cube is now made, so save it to our targets array.
            targets.push(cloned_target_cube)
        }

        // Now we have our high effort and low effort cubes (with their correctly assigned colours) saved in their associated arrays.
        // We can select from these arrays rather than creating the stimuli every trial and rather than needing to load all possible colours of stimuli.
    }

    // CALLED AT THE START OF EACH TRIAL
    function trialSetup() {
        // First we get all possible stimuli we could need using the IST.findLoadedObject() function.
        const D_1_HIGH = IST.findLoadedObject("DISTRACTOR_CUBE_HIGH_1", distractors)
        const D_2_HIGH = IST.findLoadedObject("DISTRACTOR_CUBE_HIGH_2", distractors)
        const D_1_LOW = IST.findLoadedObject("DISTRACTOR_CUBE_LOW_1", distractors)
        const D_2_LOW = IST.findLoadedObject("DISTRACTOR_CUBE_LOW_2", distractors)
        const T_1_HIGH = IST.findLoadedObject("TARGET_CUBE_HIGH_1", targets)
        const T_1_LOW = IST.findLoadedObject("TARGET_CUBE_LOW_1", targets)

        // Then we determine what trial we are currently on
        const trial_type = trialTypes[currentTrialCount]


        let trial_stimuli = [] // Will use this to store the stimuli we need for the current trial

        // Detect which trial type we're on, select the correct stimuli for that trial, and randomise their order in the array
        switch (trial_type) {
            case "PRESENT_INNER_HIGH":
                trial_stimuli = _.shuffle([D_1_LOW, D_2_LOW, D_1_HIGH, T_1_HIGH])
                break;
            case "PRESENT_INNER_LOW":
                trial_stimuli = _.shuffle([D_1_HIGH, D_2_HIGH, D_1_LOW, T_1_LOW])
                break;
            case "PRESENT_OUTER_HIGH":
                trial_stimuli = _.shuffle([D_1_LOW, D_2_LOW, D_1_HIGH, T_1_HIGH])
                break
            case "PRESENT_OUTER_LOW":
                trial_stimuli = _.shuffle([D_1_HIGH, D_2_HIGH, D_1_LOW, T_1_LOW])
                break
            case "ABSENT_INNER":
                trial_stimuli = _.shuffle([D_1_HIGH, D_2_HIGH, D_1_LOW, D_2_LOW])
                break;
            default:
                // ABSENT_OUTER
                trial_stimuli = _.shuffle([D_1_HIGH, D_2_HIGH, D_1_LOW, D_2_LOW])
                break;
        }

        // Finally, add the stimuli to the scene using IST.placeInConcentricRings()
        if (trial_type.includes("INNER")) {
            IST.placeInConcentricRings({
                stimuli: trial_stimuli, // Stimuli we fetched earlier
                totalRingSections: 8,
                totalRings: 2,
                ringToUse: 0, // Use the inner ring
                randomPosition: true,
                randomRotation: true
            })
        } else {
            IST.placeInConcentricRings({
                stimuli: trial_stimuli, // Stimuli we fetched earlier
                totalRingSections: 8,
                totalRings: 2,
                ringToUse: 1, // Use the outer ring
                randomPosition: true,
                randomRotation: true
            })
        }

        // Finally set virtual camera position each trial
        IST.camera.position.z = 150;
        IST.camera.lookAt(0, 0, 0)
    }


    // PROCESS/CREATE OUR STIMULI
    // Now we call setupStimuli() for the first and only time
    setupStimuli()

    // BUILD ALL OF OUR JSPSYCH TRIALS
    // Next we build all of our trials that we will use in our timeline

    // Instruction trial is where we would provide instructions on how to complete the experiment.
    const INSTRUCTION_TRIAL = {
        type: htmlButtonResponse,
        on_start() {
        },
        stimulus: `
                <h3>Welcome!</h3>
                Your task is to search through displays of virtual cubes until you find a T shape or deem it to be absent.
                <br>
                You can rotate the cubes by clicking and dragging on them with your cursor.
                <br><br>
                If you think you have found the T shape, press the <b>'M'</b> key on your keyboard.
                <br>
                If you think there is no T shape present on any of the cubes press the <b>'Z'</b> key on your keyboard instead.
                <br><br>
                There is a total of 8 displays to search through.
                <br>
                When you are ready to start, press the button below!
                `,
        on_finish(data) {
            // When not using IST, we can still save to JsPsych data like we would do normally
            data.TRIAL_TYPE = "INSTRUCTION_TRIAL"

        },
        choices: ['Start Experiment']
    }

    // Fixation cross displayed before each search trial
    const FIXATION_CROSS_TRIAL = {
        type: htmlKeyboardResponse,
        stimulus: '<p style="font-size: 48px;">+</p>',
        choices: "NO_KEYS",
        trial_duration: 500,
        on_finish(data) {
            // When not using IST, we can still save to JsPsych data like we would do normally
            data.TRIAL_TYPE = "FIXATION_TRIAL"
        }
    }

    // HERE IS WHERE WE CARRY OUT OUR INTERACTIVE SEARCHES
    const SEARCH_TRIAL = {
        type: htmlKeyboardResponse,
        on_start() {
            trialSetup(); // Call this at the start of each trial - this fetches our processed stimuli and places them accordingly
            IST.startTrial(); // Finally we call this to start the trial - This is extremely important.
        },
        stimulus: '', // We tell jspsych not to show anything for the trial, we handle that with the IST instead. 
        on_finish() {
            IST.addData("TRIAL_TYPE", "SEARCH_TRIAL") // Adding data to our interactive data for that specific trial - here we are adding a new data point called TRIAL_TYPE with an associated value of SEARCH_TRIAL
            IST.addData("PRESENCE", trialTypes[currentTrialCount]) // Adding the current trial type, e.g., "PRESENT_INNER"
            IST.addData("TRIAL_END_DATE_STAMP", new Date().toUTCString()) // Adding a timestamp to log when participants finished this trial
            currentTrialCount++; // Update our internal counter (we use this to know which trial type to select from the trialTypes array)

            IST.endTrial(); // Call this at the end of every trial - This is extremely important. 
        },
        choices: ['z', 'm']
    }

    // Finally, this is the trial we show participants after they have finished the rest of the experiment
    // It is here that we save our data...
    const DEBREIF_TRIAL = {
        type: htmlButtonResponse,

        // Note here how we have made the on_start() method async - this is so we can make it wait whilst it saves the data
        async on_start() {

            // At the start of this trial we want to save our data 
            IST.turnOnLoadingScreen("Saving data, please wait!") // Always start by turning on the loading screen.

            // Then we can save it
            await IST.saveData(true); // Automatically download - set optional argument to true if you wish to use the file picker instead - note that when doing so you will need to make the function async

            // If you are not using a local machine you should instead send your data to a server...
            const myData = IST.getData(true) // call the getData() function to quickly retrieve your data - setting the optional arguement to true here will return a string instead of a javascript object
            // then handle sending that data object to the server however you wish to.
            // See our recommendations for handling data with servers on our documentation site or in our paper.

            IST.turnOffLoadingScreen() // Finally turn off the loading screen and provide participants with any final information they need.
        },
        stimulus: `
                <h3>This is the end of the experiment!</h3>
                Thank you for taking time to complete this study, your participation is greatly appreciated.
                `,
        on_finish() {
        },
        choices: ['Finish Experiment']
    }

    // NOW WE SETUP THE ACTUAL TRIAL TIMELINE
    timeline.push(INSTRUCTION_TRIAL)

    // Add fixation crosses and search trials to the timeline
    for (let i = 0; i < trialTypes.length; i++) {
        timeline.push(FIXATION_CROSS_TRIAL, SEARCH_TRIAL);
    }

    // Add debreif trial
    timeline.push(DEBREIF_TRIAL)


    IST.turnOffLoadingScreen() // Now everything is done, we can turn off the loading screen and start the experiment by running the timeline

    // Run the jsPsych timeline
    jsPsych.run(timeline); // Experiment begins now
})