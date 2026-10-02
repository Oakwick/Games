/* Line of Fire — the eight pictures (Oakwick Games, special edition, October 2026).
 * Each picture is drawn on a 600 x 400 canvas. Parts that move when "something moves, slips, drops,
 * swings, energises or fails" carry class "mv" and a --f transform; the page adds class "fail" to the
 * <svg> to play it. "on-fail" parts appear, "off-fail" parts disappear, "spin" parts rotate.
 * Nothing in this file says which hand positions are dangerous. */
var LofArt = (function () {
  var C = {
    sky: '#dfe4e2', ground: '#a3a69f', groundDark: '#8d9089', steel: '#b4bbc0', steelDark: '#6d757c', dark: '#262b30',
    orange: '#e9781c', orangeDark: '#c25e0c', wood: '#8a6846', woodDark: '#6b4f33', leaf: '#5f8c4b', leafDark: '#476f38',
    rope: '#e7c23a', red: '#c1272d', white: '#efede5', glass: '#9fb4bf', yellow: '#f2b61b', inside: '#3b4147', flash: '#ffe14a'
  };
  function mv(f, inner, origin) { return '<g class="mv" style="--f:' + f + (origin ? ';transform-origin:' + origin : '') + '">' + inner + '</g>'; }
  function leaves(list, fill) {
    return list.map(function (l) { return '<ellipse cx="' + l[0] + '" cy="' + l[1] + '" rx="' + (l[2] || 12) + '" ry="' + (l[3] || 6) + '" transform="rotate(' + (l[4] || 0) + ' ' + l[0] + ' ' + l[1] + ')" fill="' + (fill || C.leaf) + '"/>'; }).join('');
  }
  function wheel(x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + C.dark + '"/><circle cx="' + x + '" cy="' + y + '" r="' + Math.round(r * 0.46) + '" fill="' + C.steel + '"/><circle cx="' + x + '" cy="' + y + '" r="' + Math.round(r * 0.14) + '" fill="' + C.steelDark + '"/>'; }
  function backdrop(groundY, groundFill, skyFill) {
    return '<rect width="600" height="400" fill="' + (skyFill || C.sky) + '"/>' + (groundY ? '<rect y="' + groundY + '" width="600" height="' + (400 - groundY) + '" fill="' + (groundFill || C.ground) + '"/>' : '');
  }

  var SCENES = {};

  // 1. Hitching up: truck on the left (rolls back), chipper drawbar and coupling on the right.
  SCENES.hitch = function () {
    // a flatbed pickup, drawn bigger than the chipper it tows: the back of the cab, headboard, dropside bed, rear wheel and tow bar
    var truck =
      '<path d="M-10 78 H16 Q34 78 39 96 L46 206 V272 H-10 Z" fill="' + C.white + '" stroke="#c4c1b6" stroke-width="2"/>' +
      '<path d="M-10 92 H14 Q24 92 27 103 L33 166 H-10 Z" fill="' + C.glass + '"/>' +
      '<path d="M-2 174 V270" stroke="#c4c1b6" stroke-width="2"/><rect x="8" y="180" width="20" height="7" rx="3.500" fill="' + C.steelDark + '"/>' +
      '<rect x="-10" y="222" width="55" height="13" fill="' + C.orange + '"/><rect x="-10" y="260" width="56" height="12" fill="#cfccc1"/>' +
      '<rect x="-6" y="65" width="26" height="13" rx="5" fill="' + C.orange + '"/>' +
      '<rect x="40" y="216" width="126" height="15" fill="' + C.dark + '"/>' +
      '<rect x="46" y="68" width="10" height="140" fill="' + C.dark + '"/><path d="M51 80 V198" stroke="' + C.steelDark + '" stroke-width="2.500" stroke-dasharray="6 7"/>' +
      '<g fill="' + C.wood + '"><circle cx="80" cy="157" r="14"/><circle cx="110" cy="153" r="16"/><circle cx="141" cy="158" r="12"/></g><g fill="#c9a877"><circle cx="80" cy="157" r="6.500"/><circle cx="110" cy="153" r="7.500"/><circle cx="141" cy="158" r="5.500"/></g>' +
      '<rect x="50" y="204" width="116" height="12" fill="#4a5056"/>' +
      '<rect x="56" y="166" width="108" height="38" rx="2" fill="' + C.white + '" stroke="#b9b6ab" stroke-width="2"/>' +
      '<rect x="58" y="181" width="104" height="8" fill="' + C.orange + '"/>' +
      '<path d="M92 168 V202 M128 168 V202" stroke="#c9c6bb" stroke-width="2"/>' +
      '<rect x="56" y="170" width="7" height="14" rx="1" fill="' + C.steelDark + '"/><rect x="157" y="170" width="7" height="14" rx="1" fill="' + C.steelDark + '"/>' +
      '<path d="M38 252 Q38 233 57 233 H127 Q146 233 146 252" fill="none" stroke="' + C.dark + '" stroke-width="8" stroke-linecap="round"/>' +
      '<rect x="157" y="218" width="9" height="19" rx="2" fill="' + C.red + '"/><rect x="157" y="239" width="9" height="9" rx="2" fill="' + C.yellow + '"/>' +
      wheel(92, 292, 46) +
      '<rect x="147" y="231" width="9" height="72" fill="' + C.steelDark + '"/>' +
      '<rect x="150" y="296" width="42" height="9" fill="' + C.steelDark + '"/>' +
      '<path d="M188 300 Q204 300 204 284 V276" fill="none" stroke="' + C.steelDark + '" stroke-width="9"/>' +
      '<circle cx="204" cy="270" r="12" fill="' + C.steel + '" stroke="' + C.dark + '" stroke-width="2"/>';
    var chipper =
      '<path d="M560 150 V112 Q560 86 534 86 H506" fill="none" stroke="' + C.orange + '" stroke-width="26"/><rect x="500" y="71" width="9" height="30" rx="3" fill="' + C.orangeDark + '"/>' +
      '<path d="M466 142 H610 V250 H466 Q454 250 454 238 V154 Q454 142 466 142 Z" fill="' + C.orange + '"/>' +
      '<rect x="454" y="232" width="156" height="18" fill="' + C.orangeDark + '"/>' +
      '<path d="M486 162 h70 v48 h-70 z" fill="' + C.orangeDark + '"/><path d="M494 172 h54 M494 184 h54 M494 196 h54" stroke="' + C.orange + '" stroke-width="4"/>' +
      '<path d="M574 250 a46 46 0 0 0 -70 0 z" fill="' + C.dark + '"/>' + wheel(540, 304, 34) +
      '<rect x="284" y="254" width="326" height="15" fill="' + C.steel + '"/><rect x="284" y="265" width="326" height="4" fill="' + C.steelDark + '"/>' +
      // coupling head: a cup that sits over the tow ball
      '<path d="M222 256 q0 -6 6 -6 h62 v19 h-24 v9 h-7 a15 15 0 0 0 -30 0 h-7 z" fill="' + C.steel + '" stroke="' + C.dark + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<rect x="244" y="237" width="44" height="9" rx="4.5" fill="' + C.red + '"/><rect x="262" y="244" width="6" height="8" fill="' + C.steelDark + '"/>' +
      // jockey wheel, clamp and winding handle
      '<rect x="330" y="194" width="13" height="118" fill="' + C.steelDark + '"/><rect x="333" y="306" width="7" height="14" fill="' + C.steel + '"/>' +
      '<path d="M336 194 v-12 h28" fill="none" stroke="' + C.steelDark + '" stroke-width="5" stroke-linejoin="round"/><circle cx="367" cy="182" r="7" fill="' + C.dark + '"/>' +
      '<rect x="321" y="250" width="31" height="24" rx="3" fill="' + C.dark + '"/><path d="M352 262 l16 8" stroke="' + C.dark + '" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="336" cy="325" r="13" fill="' + C.dark + '"/><circle cx="336" cy="325" r="5" fill="' + C.steel + '"/>' +
      // handbrake lever
      '<rect x="420" y="246" width="20" height="10" fill="' + C.steelDark + '"/><path d="M430 250 L458 212" stroke="' + C.dark + '" stroke-width="6" stroke-linecap="round"/><path d="M450 223 L460 209" stroke="' + C.red + '" stroke-width="10" stroke-linecap="round"/>';
    return backdrop(338) + '<rect y="338" width="600" height="5" fill="' + C.groundDark + '"/>' + mv('translate(38px,0)', truck) + chipper;
  };
  SCENES.hitch.label = 'The back of a flatbed pickup, its tow ball, and the chipper’s coupling, jockey wheel and handbrake';
  SCENES.hitch.dur = '2.6s'; SCENES.hitch.ease = 'cubic-bezier(.35, 0, .65, 1)';   // a slow roll back, so there is time to see it coming

  // 2. MEWP basket close to a heavy limb.
  SCENES.mewp = function () {
    var tree =
      leaves([[470, 60, 60, 34, 20], [560, 110, 60, 36, 30], [380, 20, 60, 30, 10], [590, 40, 50, 40]], C.leafDark) +
      '<path d="M250 40 L640 250" stroke="' + C.wood + '" stroke-width="54" stroke-linecap="round"/>' +
      '<path d="M270 36 L620 224 M300 74 L560 214" stroke="' + C.woodDark + '" stroke-width="3" opacity=".5"/>' +
      '<path d="M452 178 Q436 204 410 240" stroke="' + C.wood + '" stroke-width="10" stroke-linecap="round" fill="none"/>' +
      leaves([[404, 250, 15, 7, -40], [424, 238, 14, 7, 20], [392, 232, 14, 6, -70], [414, 262, 13, 6, 60]]) +
      leaves([[520, 20, 44, 22, 10], [450, 6, 40, 18, -6], [590, 150, 36, 18, 40]]);
    var basket =
      '<path d="M-30 426 L182 314" stroke="' + C.orange + '" stroke-width="30"/><path d="M-30 438 L186 324" stroke="' + C.orangeDark + '" stroke-width="6"/>' +
      '<circle cx="182" cy="314" r="20" fill="' + C.orangeDark + '"/><circle cx="182" cy="314" r="7" fill="' + C.dark + '"/>' +
      '<rect x="160" y="272" width="210" height="28" fill="' + C.steelDark + '"/><rect x="156" y="298" width="218" height="12" rx="3" fill="' + C.dark + '"/>' +
      '<rect x="160" y="166" width="8" height="134" fill="' + C.steel + '"/><rect x="261" y="166" width="8" height="134" fill="' + C.steel + '"/><rect x="362" y="166" width="8" height="134" fill="' + C.steel + '"/>' +
      '<rect x="160" y="222" width="210" height="8" fill="' + C.steel + '"/>' +
      '<rect x="154" y="158" width="222" height="12" rx="6" fill="' + C.steel + '" stroke="' + C.steelDark + '" stroke-width="2"/>' +
      '<rect x="180" y="186" width="58" height="32" rx="5" fill="' + C.dark + '"/><rect x="216" y="194" width="14" height="8" rx="2" fill="' + C.yellow + '"/><circle cx="223" cy="210" r="3" fill="#57b26b"/>' +
      '<path d="M200 188 v-14" stroke="' + C.steel + '" stroke-width="5"/><circle cx="200" cy="170" r="7" fill="' + C.red + '"/>' +
      '<path d="M278 230 v18 h44 v-18" fill="none" stroke="' + C.yellow + '" stroke-width="7" stroke-linejoin="round"/>';
    return backdrop(0) + '<path d="M0 400 V362 Q60 330 130 356 T290 350 T450 360 T600 340 V400 Z" fill="#b9c7ae"/>' + tree + mv('translate(26px,-26px)', basket);
  };
  SCENES.mewp.label = 'A MEWP basket in the crown of a tree, with a heavy limb close to its guardrail';
  SCENES.mewp.dur = '2s';

  // 3. Hand saw on a small branch.
  SCENES.handsaw = function () {
    var bg = backdrop(0, null, '#d5dccb') + leaves([[420, 60, 70, 34, 12], [540, 300, 80, 36, -14], [300, 340, 70, 30, 8], [560, 80, 50, 30, 30]], '#c4d0b6');
    var tree =
      '<rect x="-10" y="-10" width="112" height="420" fill="' + C.wood + '"/>' +
      '<path d="M14 0 V400 M40 0 V400 M70 0 V400 M90 0 V400" stroke="' + C.woodDark + '" stroke-width="3" opacity=".45"/>' +
      '<ellipse cx="100" cy="216" rx="18" ry="30" fill="' + C.wood + '"/>' +
      '<polygon points="96,196 600,160 600,186 96,236" fill="' + C.wood + '"/>' +
      '<path d="M120 226 L600 182" stroke="' + C.woodDark + '" stroke-width="3" opacity=".4"/>' +
      '<path d="M498 168 Q520 128 566 112 M430 172 Q444 150 440 124" stroke="' + C.wood + '" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      leaves([[574, 108, 16, 8, -20], [556, 96, 15, 7, -50], [584, 124, 14, 7, 10], [438, 114, 15, 7, -80], [452, 128, 14, 7, -30], [424, 132, 14, 7, 40]]) +
      '<path d="M240 186 v15" stroke="' + C.dark + '" stroke-width="3.5"/>';
    var saw =
      '<path d="M160 120 Q250 166 322 230 L312 240 Q240 188 150 138 Z" fill="#d3d8db" stroke="' + C.dark + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M312 240 Q240 188 150 138" fill="none" stroke="' + C.dark + '" stroke-width="5" stroke-dasharray="3 4"/>' +
      '<g transform="rotate(30 150 122)"><rect x="84" y="106" width="76" height="32" rx="14" fill="' + C.dark + '"/><rect x="94" y="113" width="46" height="18" rx="9" fill="' + C.orange + '"/></g>';
    return bg + tree + mv('translate(-28px,62px)', saw);
  };
  SCENES.handsaw.label = 'A hand saw cutting a small branch close to the stem';
  SCENES.handsaw.dur = '1.1s';

  // 4. Taking a section off with the chainsaw, from the basket.
  SCENES.chainsaw = function () {
    var bg = backdrop(0, null, '#d5dccb') + leaves([[120, 330, 80, 34, 10], [520, 70, 70, 34, -12], [470, 320, 70, 30, 6], [60, 60, 50, 28, 24]], '#c4d0b6');
    var limb =
      '<polygon points="-10,214 600,176 600,208 -10,262" fill="' + C.wood + '"/>' +
      '<path d="M0 250 L600 200" stroke="' + C.woodDark + '" stroke-width="3" opacity=".4"/>' +
      '<path d="M470 184 Q490 140 540 126 M540 180 Q560 160 590 158" stroke="' + C.wood + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
      leaves([[548, 120, 16, 8, -20], [530, 110, 15, 7, -50], [558, 136, 14, 7, 10], [592, 150, 14, 7, -30], [578, 166, 13, 6, 20], [498, 150, 13, 6, -60]]) +
      '<path d="M318 193 v17" stroke="' + C.dark + '" stroke-width="3.5"/>';
    // the saw is drawn lying flat, then turned to sit in the cut
    var saw = '<g transform="translate(215 112) rotate(48)">' +
      '<path d="M-42 -26 Q-40 -60 -6 -60 H26 Q50 -60 50 -30" fill="none" stroke="' + C.dark + '" stroke-width="12" stroke-linecap="round"/>' +
      '<path d="M22 -26 Q24 -44 44 -44 Q62 -44 62 -26" fill="none" stroke="' + C.dark + '" stroke-width="9" stroke-linecap="round"/>' +
      '<rect x="-52" y="-28" width="108" height="56" rx="13" fill="' + C.orange + '"/><rect x="-52" y="-28" width="70" height="20" rx="10" fill="' + C.orangeDark + '"/>' +
      '<circle cx="-18" cy="6" r="13" fill="' + C.orangeDark + '"/><circle cx="-18" cy="6" r="5" fill="' + C.dark + '"/>' +
      '<path d="M58 -34 h10 l5 30 h-15 z" fill="' + C.dark + '"/>' +
      '<path d="M54 -10 H170 Q188 -10 188 0 Q188 10 170 10 H54 Z" fill="#d3d8db" stroke="' + C.steelDark + '" stroke-width="1.5"/>' +
      '<path class="chain" d="M54 -11.500 H170 Q189.500 -11.500 189.500 0 Q189.500 11.500 170 11.500 H54" fill="none" stroke="' + C.dark + '" stroke-width="5" stroke-dasharray="8 4"/>' +
      '<rect x="40" y="-14" width="26" height="28" rx="4" fill="' + C.steel + '"/><circle cx="53" cy="0" r="4" fill="' + C.dark + '"/></g>';
    var rail = '<rect x="-10" y="356" width="620" height="12" rx="6" fill="' + C.steel + '" stroke="' + C.steelDark + '" stroke-width="2"/><rect x="120" y="366" width="9" height="40" fill="' + C.steel + '"/><rect x="460" y="366" width="9" height="40" fill="' + C.steel + '"/>';
    return bg + limb + mv('rotate(-17deg) translate(34px, -4px)', saw, '215px 112px') + rail;
  };
  SCENES.chainsaw.label = 'A chainsaw cutting a limb, seen from the basket of the MEWP';
  SCENES.chainsaw.dur = '1.1s';

  // 5. Feeding the chipper: infeed chute, rollers and a forked branch.
  SCENES.feed = function () {
    var body =
      '<rect x="392" y="92" width="220" height="222" fill="' + C.orange + '"/><rect x="392" y="296" width="220" height="18" fill="' + C.orangeDark + '"/>' +
      '<rect x="500" y="30" width="44" height="70" fill="' + C.orange + '"/><rect x="496" y="26" width="52" height="12" rx="3" fill="' + C.orangeDark + '"/>' +
      '<path d="M556 314 a44 44 0 0 0 -76 0 z" fill="' + C.dark + '"/>' + wheel(518, 322, 34) +
      '<rect x="392" y="146" width="74" height="134" fill="#2b3035"/>' +
      '<g class="spin"><circle cx="428" cy="184" r="26" fill="' + C.steelDark + '"/><circle cx="428" cy="184" r="26" fill="none" stroke="' + C.steel + '" stroke-width="6" stroke-dasharray="6 5.7"/><rect x="424" y="162" width="8" height="44" fill="' + C.steel + '"/></g>' +
      '<g class="spin"><circle cx="428" cy="242" r="26" fill="' + C.steelDark + '"/><circle cx="428" cy="242" r="26" fill="none" stroke="' + C.steel + '" stroke-width="6" stroke-dasharray="6 5.7"/><rect x="424" y="220" width="8" height="44" fill="' + C.steel + '"/></g>';
    var inside =
      '<polygon points="150,122 392,162 392,264 150,292" fill="' + C.inside + '"/>' +
      '<polygon points="150,268 392,250 392,264 150,292" fill="#565d63"/>';
    var walls =
      '<polygon points="150,106 392,148 392,162 150,122" fill="' + C.orange + '"/><polygon points="150,292 392,264 392,278 150,308" fill="' + C.orangeDark + '"/>' +
      '<rect x="92" y="298" width="62" height="11" rx="3" fill="' + C.orangeDark + '"/>';
    var bits = '<g fill="' + C.wood + '"><rect x="296" y="252" width="34" height="9" rx="4" transform="rotate(-8 313 256)"/><rect x="330" y="244" width="26" height="8" rx="4" transform="rotate(14 343 248)"/><rect x="280" y="262" width="22" height="8" rx="4" transform="rotate(-20 291 266)"/></g>';
    var bar = '<path d="M140 100 V314" stroke="' + C.red + '" stroke-width="10" stroke-linecap="round"/><rect x="140" y="110" width="16" height="6" fill="' + C.dark + '"/><rect x="140" y="298" width="16" height="6" fill="' + C.dark + '"/>';
    var branch =
      '<path d="M-30 258 L404 214" stroke="' + C.wood + '" stroke-width="13" stroke-linecap="round"/>' +
      '<path d="M130 242 L52 170" stroke="' + C.wood + '" stroke-width="9" stroke-linecap="round"/>' +
      leaves([[40, 160, 16, 8, -40], [62, 156, 15, 7, -80], [34, 180, 14, 7, 10], [70, 178, 13, 6, -20], [6, 250, 16, 7, -10], [18, 270, 15, 7, 30], [-4, 266, 14, 7, 0]]);
    return backdrop(346) + '<rect y="346" width="600" height="5" fill="' + C.groundDark + '"/>' + inside + bits + mv('translate(118px,0)', branch) + body + walls + bar;
  };
  SCENES.feed.label = 'The chipper’s infeed chute with its feed rollers, the control bar, and a forked branch going in';
  SCENES.feed.dur = '1.8s';

  // 6. Blocked discharge chute.
  SCENES.block = function () {
    var chip = function (pts, cls) { return '<g class="' + cls + '" fill="#c9a15a">' + pts.map(function (p) { return '<rect x="' + p[0] + '" y="' + p[1] + '" width="' + (p[2] || 8) + '" height="' + (p[3] || 5) + '" rx="1.5" transform="rotate(' + (p[4] || 0) + ' ' + p[0] + ' ' + p[1] + ')"/>'; }).join('') + '</g>'; };
    var machine =
      '<rect x="56" y="290" width="150" height="11" fill="' + C.steel + '"/><rect x="82" y="290" width="7" height="46" fill="' + C.steelDark + '"/><circle cx="85" cy="340" r="10" fill="' + C.dark + '"/>' +
      '<path d="M246 186 V100 Q246 54 200 54 H138" fill="none" stroke="' + C.orange + '" stroke-width="40"/>' +
      '<path d="M266 186 V100 Q266 34 200 34 H138" fill="none" stroke="' + C.orangeDark + '" stroke-width="4"/>' +
      '<rect x="130" y="30" width="10" height="48" rx="3" fill="' + C.orangeDark + '"/>' +
      '<rect x="196" y="176" width="244" height="134" rx="12" fill="' + C.orange + '"/><rect x="196" y="292" width="244" height="18" fill="' + C.orangeDark + '"/>' +
      '<path d="M350 216 h70 M350 230 h70 M350 244 h70 M350 258 h70" stroke="' + C.orangeDark + '" stroke-width="5" stroke-linecap="round"/>' +
      '<rect x="352" y="146" width="11" height="32" fill="' + C.dark + '"/><g fill="#c3c8c6"><circle cx="358" cy="134" r="7"/><circle cx="366" cy="116" r="10"/><circle cx="378" cy="94" r="12"/></g>' +
      '<polygon points="438,196 568,148 568,304 438,280" fill="' + C.orangeDark + '"/><polygon points="448,204 562,162 562,292 448,272" fill="' + C.inside + '"/>' +
      '<path d="M572 138 V312" stroke="' + C.red + '" stroke-width="10" stroke-linecap="round"/>' +
      '<path d="M378 310 a48 48 0 0 0 -84 0 z" fill="' + C.dark + '"/>' + wheel(336, 326, 34) +
      '<circle cx="250" cy="246" r="56" fill="' + C.orangeDark + '" stroke="' + C.dark + '" stroke-width="2"/><circle cx="250" cy="246" r="42" fill="#2b3035"/>' +
      '<g class="spin"><circle cx="250" cy="246" r="34" fill="' + C.steelDark + '"/><rect x="216" y="240" width="68" height="12" rx="2" fill="' + C.steel + '"/><rect x="244" y="212" width="12" height="68" rx="2" fill="' + C.steel + '"/><circle cx="250" cy="246" r="7" fill="' + C.dark + '"/></g>' +
      '<rect x="296" y="200" width="18" height="12" rx="3" fill="' + C.dark + '"/>' +
      '<rect x="384" y="186" width="42" height="24" rx="4" fill="' + C.dark + '"/><circle cx="398" cy="198" r="6" fill="' + C.yellow + '"/><rect x="396" y="198" width="4" height="12" fill="' + C.yellow + '"/><circle cx="414" cy="198" r="3" fill="#57b26b"/>';
    var packed = chip([[150, 40, 10, 6, 10], [162, 52, 9, 5, -20], [148, 60, 10, 6, 30], [172, 42, 9, 5, 0], [160, 66, 9, 5, -10], [182, 58, 9, 5, 20], [142, 50, 9, 5, -30], [176, 68, 8, 5, 12]], 'off-fail') +
      '<rect class="off-fail" x="140" y="36" width="52" height="36" rx="6" fill="#b48a45" opacity=".55"/>';
    var spray = chip([[112, 44, 10, 6, 20], [92, 30, 9, 5, -30], [84, 62, 10, 6, 40], [60, 44, 9, 5, 0], [44, 76, 9, 5, -20], [70, 92, 10, 6, 30], [28, 54, 9, 5, 12], [104, 78, 9, 5, -40], [20, 100, 8, 5, 8], [52, 118, 9, 5, -14], [96, 104, 8, 5, 26]], 'on-fail');
    return backdrop(350) + '<rect y="350" width="600" height="5" fill="' + C.groundDark + '"/>' + machine + packed + spray;
  };
  SCENES.block.label = 'A chipper with its discharge chute packed solid, the flywheel housing, the key and the control bar';
  SCENES.block.dur = '1.2s';

  // 7. A weeping hydraulic hose at the foot of the MEWP boom.
  SCENES.hose = function () {
    var HOSE = 'M128 212 C190 214 150 318 240 318 S380 330 420 296 S400 214 356 196';
    var machine =
      '<rect x="-10" y="268" width="620" height="82" fill="' + C.white + '"/><rect x="-10" y="268" width="620" height="6" fill="#d4d1c6"/>' +
      '<rect x="-10" y="274" width="620" height="9" fill="' + C.orange + '"/><rect x="-10" y="342" width="620" height="8" fill="#cfccc1"/>' +
      '<path d="M150 170 L640 20" stroke="' + C.orange + '" stroke-width="46"/><path d="M158 190 L640 42" stroke="' + C.orangeDark + '" stroke-width="5"/>' +
      '<rect x="50" y="256" width="172" height="14" rx="4" fill="' + C.dark + '"/>' +
      '<rect x="60" y="146" width="152" height="112" rx="12" fill="' + C.orange + '"/><rect x="60" y="146" width="152" height="26" rx="12" fill="' + C.orangeDark + '"/>' +
      '<circle cx="150" cy="170" r="22" fill="' + C.dark + '"/><circle cx="150" cy="170" r="8" fill="' + C.steel + '"/>' +
      // the lift ram: barrel, chrome rod and its two pins
      '<path d="M250 258 L372 172" stroke="' + C.steelDark + '" stroke-width="26" stroke-linecap="round"/><path d="M256 250 L366 172" stroke="' + C.steel + '" stroke-width="4" opacity=".5"/>' +
      '<path d="M372 172 L452 114" stroke="' + C.steelDark + '" stroke-width="14" stroke-linecap="round"/><path d="M372 172 L452 114" stroke="#cfd5d9" stroke-width="9" stroke-linecap="round"/>' +
      '<circle cx="250" cy="258" r="9" fill="' + C.dark + '"/><circle cx="452" cy="114" r="9" fill="' + C.dark + '"/>' +
      '<rect x="84" y="196" width="46" height="36" rx="5" fill="' + C.dark + '"/><circle cx="98" cy="208" r="4" fill="' + C.steel + '"/><circle cx="98" cy="222" r="4" fill="' + C.steel + '"/>';
    var hoses =
      '<path d="M128 224 C176 228 168 284 226 280 S256 268 254 258" fill="none" stroke="#1b1e21" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="' + HOSE + '" fill="none" stroke="#1b1e21" stroke-width="9" stroke-linecap="round"/>' +
      '<path d="' + HOSE + '" fill="none" stroke="#5a5f64" stroke-width="2" stroke-linecap="round" transform="translate(0 -2.500)" opacity=".7"/>' +
      // the wet, oily stretch, with drips and a small pool
      '<path d="M222 318 Q300 318 360 327" fill="none" stroke="#b98f2a" stroke-width="5" stroke-linecap="round" opacity=".75"/>' +
      '<path d="M222 316 Q300 316 360 325" fill="none" stroke="#f2e2a6" stroke-width="1.500" stroke-linecap="round" opacity=".9"/>' +
      '<g fill="#a07a22"><path d="M262 326 q-3 7 0 10 q3 -3 0 -10z"/><path d="M304 328 q-3 8 0 11 q3 -3 0 -11z"/><path d="M338 332 q-2.500 6 0 8.500 q2.500 -2.500 0 -8.500z"/></g>' +
      '<ellipse cx="296" cy="345" rx="46" ry="4" fill="#8a6a1f" opacity=".7"/>';
    var jet = '<g class="on-fail"><path d="M332 322 L286 222" stroke="#b98f2a" stroke-width="4" stroke-linecap="round"/><path d="M332 322 L286 222" stroke="#f6ecc4" stroke-width="1.500" stroke-linecap="round"/>' +
      '<g fill="#b98f2a"><circle cx="282" cy="212" r="3.500"/><circle cx="292" cy="204" r="2.500"/><circle cx="274" cy="202" r="2.500"/><circle cx="286" cy="192" r="2"/><circle cx="298" cy="216" r="2"/><circle cx="268" cy="214" r="2"/><circle cx="278" cy="184" r="1.500"/><circle cx="300" cy="194" r="1.500"/></g>' +
      '<circle cx="332" cy="322" r="6" fill="none" stroke="' + C.flash + '" stroke-width="2.500"/></g>';
    var panel = '<rect x="470" y="212" width="96" height="58" rx="7" fill="' + C.dark + '"/><rect x="482" y="222" width="34" height="34" rx="5" fill="' + C.yellow + '"/><circle cx="499" cy="239" r="12" fill="' + C.red + '"/><circle cx="499" cy="239" r="5" fill="#8f1a1f"/>' +
      '<circle cx="538" cy="232" r="5" fill="#57b26b"/><rect x="528" y="244" width="24" height="8" rx="2" fill="' + C.steelDark + '"/>';
    var card = '<polygon points="414,262 428,252 572,316 560,332" fill="#c49a62" stroke="#9b7745" stroke-width="2" stroke-linejoin="round"/><path d="M430 262 L560 320" stroke="#a9824e" stroke-width="1.500" stroke-dasharray="5 5"/>';
    return backdrop(350) + '<rect y="350" width="600" height="5" fill="' + C.groundDark + '"/>' + machine + hoses + card + panel + jet;
  };
  SCENES.hose.label = 'The foot of the MEWP boom: its hydraulic ram and hoses, an oily stretch of hose, the stop button and a strip of cardboard';
  SCENES.hose.dur = '1s';

  // 8. Sharpening the chainsaw on the back of the truck.
  SCENES.sharpen = function () {
    var bg = backdrop(0, null, '#d6d9d6') + '<rect y="296" width="600" height="104" fill="#7d838a"/><rect y="296" width="600" height="7" fill="#959ba1"/>' +
      '<path d="M40 330 H560 M40 352 H560 M40 374 H560" stroke="#6d737a" stroke-width="3"/>';
    var saw =
      '<path d="M152 200 H98 Q80 200 80 218 V262 Q80 280 98 280 H152" fill="none" stroke="' + C.dark + '" stroke-width="15"/>' +
      '<path d="M190 184 Q184 118 234 118 H262 Q294 118 294 152 V184" fill="none" stroke="' + C.dark + '" stroke-width="13"/>' +
      '<rect x="146" y="176" width="176" height="112" rx="16" fill="' + C.orange + '"/><rect x="146" y="176" width="124" height="36" rx="14" fill="' + C.orangeDark + '"/>' +
      '<circle cx="200" cy="244" r="20" fill="' + C.orangeDark + '"/><circle cx="200" cy="244" r="8" fill="' + C.dark + '"/>' +
      '<path d="M310 124 h14 l7 62 h-21 z" fill="' + C.dark + '"/>' +
      '<path d="M316 214 H540 Q566 214 566 231 Q566 248 540 248 H316 Z" fill="#d3d8db" stroke="' + C.steelDark + '" stroke-width="1.5"/>' +
      '<path class="chain" d="M316 212 H540 Q568 212 568 231 Q568 250 540 250 H316" fill="none" stroke="' + C.dark + '" stroke-width="6" stroke-dasharray="8 4"/>' +
      '<rect x="296" y="204" width="46" height="40" rx="4" fill="' + C.steel + '"/><circle cx="310" cy="224" r="5" fill="' + C.dark + '"/><circle cx="328" cy="224" r="5" fill="' + C.dark + '"/>' +
      '<rect x="282" y="250" width="46" height="34" rx="4" fill="' + C.steelDark + '"/><path d="M290 260 h30 M290 268 h30 M290 276 h30" stroke="' + C.dark + '" stroke-width="3"/>' +
      '<rect class="on-fail" x="282" y="250" width="46" height="34" rx="4" fill="' + C.red + '" opacity=".6"/>' +
      '<path d="M340 262 q5 -6 0 -12 q-5 -6 0 -12 M352 268 q5 -6 0 -12 q-5 -6 0 -12 M364 262 q5 -6 0 -12 q-5 -6 0 -12" fill="none" stroke="' + C.red + '" stroke-width="2.5" stroke-linecap="round" opacity=".75"/>';
    var file = '<path d="M434 222 L484 168" stroke="#8d949a" stroke-width="5" stroke-linecap="round"/><path d="M484 168 L512 138" stroke="#b9853a" stroke-width="13" stroke-linecap="round"/>';
    return bg + saw + mv('translate(-52px,52px)', file);
  };
  SCENES.sharpen.label = 'A chainsaw on the back of the truck with a round file on its chain';
  SCENES.sharpen.dur = '1.1s';

  // The hand marker: a work glove with a letter badge.
  function glove() {
    var parts = '<rect x="-13" y="-16" width="6" height="18" rx="3"/><rect x="-6.5" y="-21" width="6" height="22" rx="3"/><rect x="0" y="-22" width="6" height="23" rx="3"/><rect x="6.5" y="-18" width="6" height="19" rx="3"/>' +
      '<rect x="10" y="-4" width="7" height="17" rx="3.5" transform="rotate(-38 13 10)"/><rect x="-13" y="-6" width="25.5" height="25" rx="7"/>';
    return '<g class="g-out">' + parts + '</g><g class="g-in">' + parts + '</g><rect class="g-cuff" x="-12" y="15" width="23.5" height="6" rx="2"/>';
  }
  function marker(h, letter, cls, scale) {
    return '<g class="hand ' + (cls || '') + '" data-hand="' + h.id + '" transform="translate(' + h.x + ' ' + h.y + ')' + (scale && scale !== 1 ? ' scale(' + scale + ')' : '') + '">' +
      '<circle class="h-ring" r="31"/><circle class="h-hit" r="34" fill="transparent"/>' + glove() +
      '<g transform="translate(19 17)"><circle class="h-badge" r="11"/><text class="h-letter" y="4.5" text-anchor="middle">' + letter + '</text></g></g>';
  }
  function scene(art) { var f = SCENES[art]; return f ? { svg: f(), label: f.label, dur: f.dur || '1.2s', ease: f.ease || 'cubic-bezier(.5, 0, .6, 1)' } : { svg: backdrop(0), label: '', dur: '1.2s', ease: 'ease' }; }
  return { scene: scene, marker: marker, glove: glove, C: C };
})();
if (typeof module !== 'undefined') module.exports = LofArt;
