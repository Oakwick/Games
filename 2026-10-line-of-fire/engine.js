/* Line of Fire — content, answers and scoring (Oakwick Games, special edition, October 2026)
 * A hand-safety game: eight moments from a tree team's working day. For each one the player marks
 * every hand position that is in the line of fire, then chooses what to do.
 * Plain ES5, no DOM.
 *
 * This file is on the website on purpose. Line of Fire is open to anyone and has no prize or scoreboard,
 * so the answers don't need hiding: the page marks them itself. The server (Code.gs) includes the same
 * file and re-scores every completion before it goes on the record.
 *
 * hands:   x, y = where the marker sits on the 600 x 400 picture. danger = in the line of fire.
 * options: written in the order they are shown. best = full marks, partial = half marks.
 */
var LineOfFire = (function () {
  var VERSION = 'lof-2026-10.4';
  var HAND_PTS = 60, ACT_PTS = 40;

  var QUESTION = 'Where could my hands end up if something moves, slips, drops, swings, energises or fails?';
  var COMMITMENT = 'Before I start any task, I will stop and work out where my hands could be trapped, crushed, cut or burned.';
  var PRINCIPLES = [
    { n: 1, title: 'Keep your hands out of the line of fire', text: 'If your hand is between two things, ask what happens if one of them moves. Never put fingers where they can be trapped, crushed or cut.' },
    { n: 2, title: 'Use the right tool, not your hand', text: 'A push stick, the jockey wheel, tongs, a bar. Never a hand under or near a load that could move.' },
    { n: 3, title: 'Slow down for the jobs around the job', text: 'Setting up, checks, maintenance, clearing blockages and packing up need the same thought as the main task.' },
    { n: 4, title: 'Stop if it isn’t right', text: 'If something doesn’t look right, the plan doesn’t cover it or conditions have changed, stop and reassess.' },
    { n: 5, title: 'Gloves on, but don’t rely on them', text: 'Wear the right gloves for every task. They reduce cuts, grazes and burns. They will not stop a crush or a trapped finger.' }
  ];

  var SCENES = [
    { id: 'S1', art: 'hitch', when: 'Start of the day', title: 'Hitching up the chipper',
      situation: 'You’re coupling the chipper to the truck. Your mate has reversed up and stopped just short, with the engine running. The hitch is hovering beside the tow ball.',
      hands: [
        { id: 'a', x: 232, y: 278, label: 'Under the coupling head, guiding it onto the ball', danger: true,
          why: 'If the truck rolls back or the hitch drops, your fingers are between the ball and the coupling. Nothing gives.' },
        { id: 'b', x: 372, y: 178, label: 'On the jockey wheel handle, winding the hitch down', danger: false,
          why: 'This is how the hitch should come down: wound from the handle, with your hand nowhere near the ball.' },
        { id: 'c', x: 462, y: 206, label: 'On the chipper’s handbrake lever', danger: false,
          why: 'Clear of anything that can close on it, and the handbrake stops the chipper rolling.' },
        { id: 'd', x: 336, y: 300, label: 'Gripping the jockey wheel stem just below its clamp, as you slacken the clamp', danger: true,
          why: 'Slacken the clamp with the weight still on the jockey wheel and the drawbar drops, sliding the clamp down the stem onto your hand.' }
      ],
      question: 'The hitch is a few centimetres off the ball. What do you do?',
      options: [
        { id: 'w', label: 'Hold the coupling and guide it on while the driver inches back' },
        { id: 'x', label: 'Stand clear and guide the driver back until the ball is under the coupling. Truck handbrake on, then wind the hitch down with the jockey wheel' },
        { id: 'y', label: 'Put your gloves on, then lift the coupling across and drop it on the ball' },
        { id: 'z', label: 'Truck handbrake on, then drag the chipper across by its drawbar until the hitch is over the ball' }
      ],
      best: 'x', partial: ['z'], principle: 1,
      happens: 'The truck rolls back.',
      why: 'The moment a hand goes between the ball and the coupling, one small movement from the truck or the chipper crushes it. Let the truck do the lining up while you stand clear, make it safe, then let the jockey wheel do the lowering. Gloves make no difference to a crush.',
      real: 'A coupling carries the nose weight of the chipper, and a truck rolling back carries far more. A fingertip caught there is crushed or lost, not bruised. That can mean surgery, weeks off the tools and a grip that never fully comes back.',
      partialWhy: 'Making the truck safe first was right, and your hands stay out from under the coupling. But hauling a chipper about by hand is how backs and feet get hurt. Let the truck do the moving.' },

    { id: 'S2', art: 'mewp', when: 'First cut of the morning', title: 'Moving the basket',
      situation: 'You’re in the MEWP basket, slewing in alongside the crown to reach the first cut. A heavy limb is close on one side.',
      hands: [
        { id: 'a', x: 338, y: 166, label: 'Resting on top of the guardrail, on the side nearest the limb', danger: true,
          why: 'The basket only has to travel a little further than you meant, and your hand is the thing between the rail and the limb.' },
        { id: 'b', x: 208, y: 176, label: 'On the controls', danger: false,
          why: 'Inside the basket, behind the guardrail. This is where your hands should be while it moves.' },
        { id: 'c', x: 436, y: 176, label: 'Reaching out over the rail to push a branch aside', danger: true,
          why: 'Outside the rail while the basket is moving, your hand and arm can be caught between the branch and the basket.' },
        { id: 'd', x: 300, y: 246, label: 'On the handhold inside the basket', danger: false,
          why: 'Inside the line of the guardrail, so nothing outside the basket can close on it.' }
      ],
      question: 'A branch is in the way of where you want the basket. What do you do?',
      options: [
        { id: 'w', label: 'Push the branch aside with one hand and boom past it' },
        { id: 'x', label: 'Keep both hands inside and squeeze past slowly, letting the branch drag along the rail' },
        { id: 'y', label: 'Stop. Hands inside the rails, then bring the basket in by a different route, slowly, watching the way it is travelling' },
        { id: 'z', label: 'Lean out and hold the branch back until the basket is through' }
      ],
      best: 'y', partial: [], principle: 1,
      happens: 'The basket travels a little further than you meant.',
      why: 'Move the machine, not the branch. With your hands inside the guardrail there is nothing for the tree to trap, and a slower route gives you time to see where the basket is going. Squeezing past drags the basket, the controls and you through the tree: if your hands are that close to it, so is the rest of you.',
      real: 'People have been killed when a MEWP basket trapped them against something overhead. For a hand it means crushed and broken fingers. If it is your chest or head between the rail and the limb, you may not be able to reach the controls at all.',
      partialWhy: '' },

    { id: 'S3', art: 'handsaw', when: 'Mid-morning', title: 'A quick hand saw cut',
      situation: 'You’re taking a small branch off with a hand saw. One hand saws. The question is where the other one goes.',
      hands: [
        { id: 'a', x: 196, y: 214, label: 'Holding the branch a hand’s width from the cut', danger: true,
          why: 'A hand saw can jump out of the cut, especially on the first few strokes or when the branch springs. This hand is exactly where it lands.' },
        { id: 'b', x: 262, y: 276, label: 'Under the branch, below the cut, ready to catch the piece', danger: true,
          why: 'When the blade breaks through it keeps going, straight down into this hand.' },
        { id: 'c', x: 470, y: 176, label: 'Holding the branch at arm’s length from the cut', danger: false,
          why: 'Far enough out that a slipping blade can’t reach it, and you still have control of the piece.' },
        { id: 'd', x: 150, y: 92, label: 'On the saw’s handle', danger: false,
          why: 'Behind the teeth, where it belongs.' }
      ],
      question: 'The branch keeps springing about as you saw. What do you do?',
      options: [
        { id: 'w', label: 'Gloves on, steady the branch well away from the blade, and finish with slow, light strokes' },
        { id: 'x', label: 'Gloves on, then hold it tight right beside the cut to keep it still' },
        { id: 'y', label: 'Saw faster to get through before it moves again' },
        { id: 'z', label: 'Put the saw away and break the branch off by hand' }
      ],
      best: 'w', partial: ['z'], principle: 5,
      happens: 'The saw jumps out of the cut.',
      why: 'Hand saw teeth go through a glove. Wear the gloves, because they turn a deep cut into a shallower one, but what protects your hand is the distance between it and the blade.',
      real: 'A pruning saw is razor sharp and cuts on the pull stroke. The tendons and nerves in your hand sit just under the skin, so one slip can cut them. That means surgery, months of rehab, and fingers that may never bend or feel properly again.',
      partialWhy: 'Your hands were safe. But breaking it off tears the bark below the cut, which is poor pruning. Slow strokes with your hand well clear does both jobs.' },

    { id: 'S4', art: 'chainsaw', when: 'Late morning', title: 'Taking off a section',
      situation: 'You’re in the basket, taking a limb down in short sections with the chainsaw. Each piece has to land clear of a garden fence below.',
      hands: [
        { id: 'a', x: 414, y: 196, label: 'Left hand holding the piece just beyond the cut, ready to throw it clear', danger: true,
          why: 'This is how arborists cut their left hand and forearm. One hand can’t hold a saw that kicks, and the hand on the branch is right where the bar goes.' },
        { id: 'b', x: 270, y: 104, label: 'Left hand on the saw’s front handle', danger: false,
          why: 'On the saw, behind the hand guard. A hand that is holding the saw can’t be in front of the chain, and two hands can hold a kick.' },
        { id: 'c', x: 214, y: 236, label: 'Left hand steadying the limb on the near side of the cut', danger: true,
          why: 'Either side of the cut, a hand on the limb is within reach of the bar, and the saw is in your other hand alone.' },
        { id: 'd', x: 196, y: 56, label: 'Right hand on the rear handle and trigger', danger: false,
          why: 'On the handle that controls the saw, well behind the chain.' }
      ],
      question: 'The piece is small, and it has to land clear of the fence. What do you do?',
      options: [
        { id: 'w', label: 'Hold the piece with your left hand, cut one-handed and throw it clear' },
        { id: 'x', label: 'Both hands on the saw, cut straight through and let the piece drop' },
        { id: 'y', label: 'Both hands on the saw and make a step cut. Chain brake on, then break the piece off by hand and throw it clear' },
        { id: 'z', label: 'Chainsaw gloves on, then hold the piece and cut one-handed for more control' }
      ],
      best: 'y', partial: ['x'], principle: 1,
      happens: 'The saw kicks out of the cut.',
      why: 'Keep both hands on the saw whenever the chain is moving. If a piece needs placing, step-cut it, put the chain brake on, and only then use your hands. Chainsaw gloves only protect the back of the hand, and they don’t make one-handed cutting safe.',
      real: 'A running chain tears through skin, tendon and bone in a fraction of a second. With one hand on the branch, your left hand and forearm are right beside the bar. Cuts like that can leave permanent loss of movement or feeling.',
      partialWhy: 'Both hands on the saw kept them safe, and that comes first. But a piece dropped blind can do damage below. A step cut gives you both: safe hands and a piece you can place.' },

    { id: 'S5', art: 'feed', when: 'After lunch', title: 'Feeding the chipper',
      situation: 'The brash is going through well. A few short pieces are sitting in the infeed chute, just short of the rollers.',
      hands: [
        { id: 'a', x: 318, y: 238, label: 'Inside the chute, pushing the short pieces towards the rollers', danger: true,
          why: 'The rollers pull in whatever they grip, and they can’t tell a glove from a branch.' },
        { id: 'b', x: 62, y: 250, label: 'Holding the tail end of a long branch, standing to one side of the chute', danger: false,
          why: 'Outside the chute and off to the side. When the rollers take the branch, you let go.' },
        { id: 'c', x: 196, y: 196, label: 'Gripping a forked branch with your hand through the fork', danger: true,
          why: 'Forks and side branches hook your hand, glove or sleeve, and take it with them when the rollers pull.' },
        { id: 'd', x: 140, y: 96, label: 'On the control bar', danger: false,
          why: 'Outside the chute, and it is the one thing here that stops the rollers.' }
      ],
      question: 'How do you get the short pieces through?',
      options: [
        { id: 'w', label: 'Push them in with a longer branch or a long wooden push stick' },
        { id: 'x', label: 'Reach in and flick them forward while the rollers are busy' },
        { id: 'y', label: 'Push them in with your boot' },
        { id: 'z', label: 'Shut the chipper down, wait for it to stop, then lift them out' }
      ],
      best: 'w', partial: ['z'], principle: 2,
      happens: 'The rollers take the branch.',
      why: 'No part of you goes inside the chute while the chipper is running. A long branch or a push stick does the job from outside. If the rollers grab it, they take the stick and not your hand.',
      real: 'Feed rollers pull material in faster than you can pull your hand back, and they don’t let go. People drawn into a chipper have lost fingers, hands and arms, and some have died. The control bar only helps if somebody can reach it.',
      partialWhy: 'Safe, and the right move if the pieces are jammed. For loose pieces, a push stick does it without stopping the job.' },

    { id: 'S6', art: 'block', when: 'Mid-afternoon', title: 'A blocked chute',
      situation: 'The discharge chute has blocked with one load left to chip. The engine is ticking over. It would only take a second to clear.',
      hands: [
        { id: 'a', x: 128, y: 78, label: 'In the end of the discharge chute, pulling out the packed chip', danger: true,
          why: 'The engine is running. When the blockage lets go, everything behind it starts moving again with your hand in the way.' },
        { id: 'b', x: 404, y: 190, label: 'On the key, switching off and taking it out', danger: false,
          why: 'The first move. Nothing gets cleared until this is done and the key is in your pocket.' },
        { id: 'c', x: 300, y: 262, label: 'Opening the cover over the flywheel while it is still spinning down', danger: true,
          why: 'The flywheel carries on turning long after the engine stops, and you can’t always hear it.' },
        { id: 'd', x: 548, y: 150, label: 'On the control bar, stopping the feed rollers', danger: false,
          why: 'Your hand is safe here. But stopping the rollers doesn’t stop the flywheel, so it is not the same as switching off.' }
      ],
      question: 'What is the right way to clear it?',
      options: [
        { id: 'w', label: 'Stop the feed rollers with the control bar and clear it at tick-over' },
        { id: 'x', label: 'Engine off, then clear it straight away while everything winds down' },
        { id: 'y', label: 'Engine off, key out, wait until everything has stopped, then reach up the chute and pull the chip out by hand, gloves on' },
        { id: 'z', label: 'Engine off, key out, wait until everything has completely stopped, then clear it the way the maker’s instructions say' }
      ],
      best: 'z', partial: ['y'], principle: 3,
      happens: 'The blockage lets go with the flywheel still turning.',
      why: 'Clearing a blockage is a job in its own right, and it deserves the same thought as the chipping. Switch off, take the key and wait for everything to stop. Then follow the maker’s method: the blades are sharp even when they are still, and the flywheel can turn as the blockage comes free.',
      real: 'A chipper’s flywheel is heavy, carries the blades, and keeps turning for some time after the engine stops. A hand inside while it is still moving loses fingers. This is the classic injury on a job that would ‘only take a second’.',
      partialWhy: 'The shut-down was right, and gloves are the minimum. But follow the maker’s method for clearing it: the blades are sharp even when they are still, and the flywheel can turn as the blockage comes free.' },

    { id: 'S7', art: 'hose', when: 'Late afternoon', title: 'An oily hose',
      situation: 'The MEWP has been slow all afternoon. Back on the ground, you find a wet, oily stretch of hydraulic hose at the foot of the boom, with the engine still running. You can’t see exactly where the oil is coming from.',
      hands: [
        { id: 'a', x: 196, y: 300, label: 'Bare hand running along the hose to feel for the leak', danger: true,
          why: 'A pinhole in a hose under pressure fires oil out in a jet too fine to see. It goes through skin like a needle.' },
        { id: 'b', x: 380, y: 330, label: 'Gloved hand running along the hose to feel for the leak', danger: true,
          why: 'A work glove doesn’t stop it. The jet goes straight through leather and fabric, and through the skin underneath.' },
        { id: 'c', x: 556, y: 312, label: 'Holding the far end of a strip of cardboard against the hose', danger: false,
          why: 'The card finds the leak, so your skin doesn’t have to. Oil shows on it at once, and your hand is at the other end.' },
        { id: 'd', x: 538, y: 238, label: 'On the stop button, shutting the engine down', danger: false,
          why: 'The first move. With the engine off, the pump stops feeding the leak.' },
        { id: 'e', x: 288, y: 322, label: 'Wiping the hose down with a rag wrapped round your hand', danger: true,
          why: 'A rag is no more protection than a glove, and it puts your palm right on the leak.' }
      ],
      question: 'There is one tree left to do. What do you do about the hose?',
      options: [
        { id: 'w', label: 'Wipe it down and carry on. It is only a weep, and there is one tree left' },
        { id: 'x', label: 'Nip the fitting up with a spanner while the engine runs, so you can see when it stops' },
        { id: 'y', label: 'Engine off, then feel along the hose to find the leak for the fitter' },
        { id: 'z', label: 'Stop. Engine off, take the machine out of use and report it. Nobody feels for the leak by hand' }
      ],
      best: 'z', partial: ['y'], principle: 4,
      happens: 'A jet too fine to see comes out of the hose.',
      why: 'A machine that isn’t right gets stopped, even with one tree left. A leaking hose can burst, and a boom that is losing oil can’t be trusted with you in the basket. Finding the leak is a job for the fitter, with the pressure released and a piece of card, not a hand.',
      real: 'A hydraulic injection injury looks like a pinprick and may hardly hurt at first. But the oil is already inside the finger, destroying it from within. It needs surgery within hours and can still end in amputation. Go straight to A&E and say “hydraulic injection”.',
      partialWhy: 'Stopping the engine was right. But a hydraulic system can hold pressure after the engine stops, so the hose can still inject. Hands stay off it.' },

    { id: 'S8', art: 'sharpen', when: 'End of the day', title: 'Touching up the chain',
      situation: 'The job is done and the kit is going back on the truck. The chain is blunt, so you give it a quick sharpen on the back of the truck. The saw was running two minutes ago, and your gloves are in the cab.',
      hands: [
        { id: 'a', x: 452, y: 262, label: 'Bare hand pulling the chain round the bar to reach the next cutters', danger: true,
          why: 'Every cutter you are about to sharpen passes through your fingers. One slip and it is a cut that needs stitches.' },
        { id: 'b', x: 504, y: 148, label: 'Bare hand on the file handle, pushing the file across the cutters', danger: true,
          why: 'Filing away from you is right, but when the file skips off a cutter your hand follows it across the chain. Bare knuckles meet the cutters you have just sharpened.' },
        { id: 'c', x: 304, y: 268, label: 'Braced on the exhaust to hold the saw still', danger: true,
          why: 'Two minutes after running, the exhaust is still hot enough to burn.' },
        { id: 'd', x: 232, y: 124, label: 'On the front handle, steadying the saw', danger: false,
          why: 'A cool, solid grip, well away from the chain and the exhaust.' }
      ],
      question: 'Your gloves are in the cab and you want to get away. What do you do?',
      options: [
        { id: 'w', label: 'Carry on bare-handed and be careful. It is only a touch-up' },
        { id: 'x', label: 'Wrap a rag round the chain to pull it through' },
        { id: 'y', label: 'Leave the sharpening until the morning, and put the saw away with its bar cover on' },
        { id: 'z', label: 'Fetch the gloves. Saw switched off and cool, gloves on, then sharpen' }
      ],
      best: 'z', partial: ['y'], principle: 3,
      happens: 'The file slips.',
      why: 'Packing up is when the thinking stops and the cuts happen. Sharpening is a job like any other: saw off, saw cool, gloves on. Thirty seconds to fetch them is cheaper than an afternoon in A&E.',
      real: 'A sharp cutter will open a bare knuckle to the bone, and a hot exhaust takes the skin off a palm. Either one means stitches or dressings, days off the saw and a hand you can’t grip with. These small injuries are the ones that happen most often.',
      partialWhy: 'A fair call, and your hands are safe. But you start tomorrow with a blunt saw, and a blunt saw makes every cut harder to control.' }
  ];

  var MAX = SCENES.length * (HAND_PTS + ACT_PTS);
  function scene(id) { for (var i = 0; i < SCENES.length; i++) if (SCENES[i].id === id) return SCENES[i]; return null; }
  function hasOpt(s, id) { for (var i = 0; i < s.options.length; i++) if (s.options[i].id === id) return true; return false; }

  // Marks one scene. Hands: every danger found earns its share; every safe hand marked takes its share away.
  function judge(s, a) {
    var picked = {}, hits = 0, wrong = 0, dangers = 0, safes = 0;
    ((a && a.h) || []).forEach(function (h) { picked[h] = true; });
    s.hands.forEach(function (h) {
      if (h.danger) { dangers++; if (picked[h.id]) hits++; }
      else { safes++; if (picked[h.id]) wrong++; }
    });
    var handPts = Math.round(HAND_PTS * Math.max(0, hits / dangers - (safes ? wrong / safes : 0)));
    var act = !a ? 0 : a.act === s.best ? 1 : s.partial.indexOf(a.act) >= 0 ? 0.5 : 0;
    return { hits: hits, wrong: wrong, dangers: dangers, handPts: handPts, act: act, actPts: Math.round(ACT_PTS * act), pts: handPts + Math.round(ACT_PTS * act), picked: picked };
  }
  // What the player sees once a scene's answer is locked in.
  function reveal(s, a) {
    var j = judge(s, a);
    return {
      s: s.id, pts: j.pts, handPts: j.handPts, actPts: j.actPts, act: j.act, hits: j.hits, wrong: j.wrong, dangers: j.dangers,
      hands: s.hands.map(function (h) { return { id: h.id, danger: h.danger, why: h.why, picked: !!j.picked[h.id] }; }),
      best: s.best, happens: s.happens, why: s.why, real: s.real, partialWhy: j.act === 0.5 ? s.partialWhy : '', principle: s.principle,
      yours: a ? { h: a.h.slice(), act: a.act } : null
    };
  }
  function sanitise(a) {
    if (!Array.isArray(a)) return [];
    return a.slice(0, 20).map(function (x) {
      if (!x) return null;
      var seen = {}, h = (Array.isArray(x.h) ? x.h : []).map(function (v) { return String(v).slice(0, 2); }).filter(function (v) { if (seen[v]) return false; seen[v] = true; return true; }).slice(0, 8);
      return { s: String(x.s || '').slice(0, 4), h: h, act: String(x.act || '').slice(0, 4) };
    }).filter(Boolean);
  }
  // Lock in the answer for the next scene. Answers come in order and can't be changed.
  function step(answers, a) {
    answers = sanitise(answers); a = sanitise([a])[0];
    var next = SCENES[answers.length];
    if (!next) return { error: 'done' };
    if (!a || a.s !== next.id) return { error: 'order', answered: answers.length };
    var ids = {}; next.hands.forEach(function (h) { ids[h.id] = true; });
    if (!a.h.length || !a.h.every(function (h) { return ids[h]; }) || !hasOpt(next, a.act)) return { error: 'bad_answer' };
    answers.push(a);
    return { answers: answers, reveal: reveal(next, a), total: score(answers).total, answered: answers.length };
  }
  function score(answers) {
    var by = {}; sanitise(answers).forEach(function (a) { if (scene(a.s) && !by[a.s]) by[a.s] = a; });
    var rows = SCENES.map(function (s) { var j = judge(s, by[s.id]); j.s = s.id; return j; });
    var sum = function (k) { return rows.reduce(function (t, r) { return t + r[k]; }, 0); };
    return { version: VERSION, total: sum('pts'), max: MAX, rows: rows, hits: sum('hits'), dangers: sum('dangers'), wrong: sum('wrong'),
      bestCalls: rows.filter(function (r) { return r.act === 1; }).length, answered: Object.keys(by).length };
  }
  function review(answers) { return sanitise(answers).filter(function (a) { return scene(a.s); }).map(function (a) { return reveal(scene(a.s), a); }); }
  function complete(answers) { return score(answers).answered >= SCENES.length; }
  return { VERSION: VERSION, HAND_PTS: HAND_PTS, ACT_PTS: ACT_PTS, MAX: MAX, QUESTION: QUESTION, COMMITMENT: COMMITMENT, PRINCIPLES: PRINCIPLES, SCENES: SCENES,
    scene: scene, judge: judge, reveal: reveal, step: step, score: score, review: review, sanitise: sanitise, complete: complete };
})();
if (typeof module !== 'undefined') module.exports = LineOfFire;
