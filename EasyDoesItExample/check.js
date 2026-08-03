function trialSetup() {
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

    IST.camera.position.set(0, 0, 150);
    IST.camera.lookAt(0, 0, 0) // Camera points towards the origin
    IST.startTrial();
}