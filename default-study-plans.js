const CHESSABLE_LINK = {
  label: 'Chessable',
  url: 'https://www.chessable.com/',
  icon: 'emoji',
  emoji: 'C'
};

const CHESSABLE_REVIEW_LINK = {
  label: 'Chessable Review',
  url: 'https://www.chessable.com/review/',
  icon: 'emoji',
  emoji: 'R'
};

const CHESSABLE_COURSES_LINK = {
  label: 'Chessable Courses',
  url: 'https://www.chessable.com/courses/',
  icon: 'emoji',
  emoji: 'C'
};

const CHESSCOM_PLAY_LINK = {
  label: 'Chess.com Play',
  url: 'https://www.chess.com/play/online',
  icon: 'emoji',
  emoji: 'C'
};

export const SUMMER_CHESS_STUDY_SEED_KEY = 'summerChessStudy2026';

export const SUMMER_CHESS_STUDY_FOLDER = {
  id: 'F_summer_chess_study_2026',
  name: 'summer chess study',
  parentId: null
};

export const CHESSABLE_WIDGET_DEFAULTS = [
  CHESSABLE_LINK,
  CHESSABLE_REVIEW_LINK,
  CHESSABLE_COURSES_LINK
];

export const DEFAULT_WIDGET_SHELF = [
  {
    id: 'w_lichess',
    label: 'Lichess',
    url: 'https://lichess.org',
    icon: 'img',
    img: 'https://lichess1.org/assets/logo/lichess-favicon-256.png'
  },
  {
    id: 'w_analysis',
    label: 'Lichess Analysis',
    url: 'https://lichess.org/analysis',
    icon: 'img',
    img: 'https://lichess1.org/assets/logo/lichess-favicon-256.png'
  },
  {
    id: 'w_chessable',
    label: 'Chessable',
    url: 'https://www.chessable.com/',
    icon: 'emoji',
    emoji: 'C'
  },
  {
    id: 'w_chessable_review',
    label: 'Chessable Review',
    url: 'https://www.chessable.com/review/',
    icon: 'emoji',
    emoji: 'R'
  },
  {
    id: 'w_chessable_courses',
    label: 'Chessable Courses',
    url: 'https://www.chessable.com/courses/',
    icon: 'emoji',
    emoji: 'C'
  }
];

const copyLinks = (links = []) => links.map(link => ({ ...link }));

const section = (day, slug, name, minutes, mode, resource, action, links = []) => ({
  id: `S_summer_chess_${day}_${slug}`,
  name,
  minutes,
  desc: `${mode}. Resource: ${resource}. ${action}`,
  links: copyLinks(links)
});

const outline = (day, title, sections) => ({
  id: `O_summer_chess_${day}`,
  title,
  source: 'summer-chess-study-2026',
  sections
});

export const SUMMER_CHESS_STUDY_OUTLINES = [
  outline('monday', 'Monday - Standard repair day', [
    section(
      'monday',
      'woodpecker_tactics_review',
      'Core 10:30-10:50 Woodpecker Tactics Review',
      20,
      'Core block, 10:30-10:50',
      'Chessable Woodpecker',
      'Review due and previously learned tactical motifs. Repeat failed patterns, then mark motifs that overlap with your own tags: tactical blindness, defensive resource missed, calculation failure.',
      [CHESSABLE_REVIEW_LINK]
    ),
    section(
      'monday',
      'new_woodpecker_tactics',
      'Core 10:50-11:05 New Woodpecker Tactics',
      15,
      'Core block, 10:50-11:05',
      'Chessable Woodpecker',
      'Controlled new tactical intake while fresh. Solve slowly enough to name the motif and trigger; stop before guessing starts.',
      [CHESSABLE_COURSES_LINK]
    ),
    section(
      'monday',
      'mistake_trainer_long_think',
      'Core 11:10-11:55 Mistake Trainer Long Think',
      45,
      'Core block, 11:10-11:55',
      'En Croissant fork - Mistake Trainer',
      'Replay personal mistake positions without engine. List candidates, commit to a move, explain the failure mode, then compare with engine/database context.'
    ),
    section(
      'monday',
      'engine_plan_explorer',
      'Core 12:00-12:30 Engine Plan Explorer',
      30,
      'Core block, 12:00-12:30',
      'En Croissant fork - Engine Plan Explorer',
      'Use a recurring repertoire position. Identify recurring manoeuvres, piece routes, pawn breaks, and defensive ideas for both sides; save the useful plan position to SRS.'
    ),
    section(
      'monday',
      'master_games_search',
      'Stretch 17:00-17:40 Master Games Search',
      40,
      'Optional stretch block, 17:00-17:40',
      'En Croissant fork - Master Games Search / Repertoire Cloner',
      'Use a structure from your own repertoire. Study model games for piece placement, pawn breaks, typical endgames, and practical plan notes.'
    )
  ]),
  outline('tuesday', 'Tuesday - Rapid loop day', [
    section(
      'tuesday',
      'woodpecker_tactics_review',
      'Core 10:30-10:50 Woodpecker Tactics Review',
      20,
      'Core block, 10:30-10:50',
      'Chessable Woodpecker',
      'Daily tactical contact. Focus on clean recognition, forcing moves, and tactical triggers rather than volume.',
      [CHESSABLE_REVIEW_LINK]
    ),
    section(
      'tuesday',
      'serious_rapid_game',
      'Core 11:00-12:00 Serious Rapid Game',
      60,
      'Core block, 11:00-12:00',
      'Chess.com / board',
      'Play one serious game, ideally 15+10 or 20+10 in this slot. If you choose 30+20 or 30+30, treat the extra time as stretch. No instant rematch spiral.',
      [CHESSCOM_PLAY_LINK]
    ),
    section(
      'tuesday',
      'immediate_no_engine_review',
      'Core 12:00-12:15 Immediate No-Engine Review',
      15,
      'Core block, 12:00-12:15',
      'Board + En Croissant fork notes',
      'While memory is fresh, mark critical moments, candidate moves missed, eval guesses, emotional state, and clock-pressure points.'
    ),
    section(
      'tuesday',
      'mistake_finder_cleanup',
      'Core 17:00-17:25 Mistake Finder Cleanup',
      25,
      'Core block, 17:00-17:25',
      'En Croissant fork - Mistake Finder',
      'Import the game, filter trivial eval drops, classify real mistakes with the taxonomy, and send useful positions to Mistake Trainer, SRS, or opening repair.'
    ),
    section(
      'tuesday',
      'srs_queue',
      'Stretch 17:25-17:50 SRS Queue',
      25,
      'Optional stretch block, 17:25-17:50',
      'En Croissant fork - SRS',
      'Review due mistake, opening-gap, and plan positions. Retrieve the move and reason before checking.'
    )
  ]),
  outline('wednesday', 'Wednesday - Calculation, endgame, and structure day', [
    section(
      'wednesday',
      'woodpecker_tactics_review',
      'Core 10:30-10:50 Woodpecker Tactics Review',
      20,
      'Core block, 10:30-10:50',
      'Chessable Woodpecker',
      'Keep motifs warm. Note patterns that would prevent one-move misses in real games.',
      [CHESSABLE_REVIEW_LINK]
    ),
    section(
      'wednesday',
      'aagaard_calculation',
      'Core 10:55-11:40 Aagaard Calculation',
      45,
      'Core block, 10:55-11:40',
      'Aagaard Calculation',
      'Deep calculation block. Build candidate moves, calculate mental/written lines, include quiet resources, give a final evaluation, and only then check.',
      [CHESSABLE_COURSES_LINK]
    ),
    section(
      'wednesday',
      'aagaard_endgame_play',
      'Core 11:45-12:20 Aagaard Endgame Play',
      35,
      'Core block, 11:45-12:20',
      'Aagaard Endgame Play',
      'Practical endings: rook endings, minor pieces, small-edge conversion, defensive resources, and simplification judgement.',
      [CHESSABLE_COURSES_LINK]
    ),
    section(
      'wednesday',
      'srs_review_queue',
      'Core 12:20-12:35 SRS Review Queue',
      15,
      'Core block, 12:20-12:35',
      'En Croissant fork - SRS',
      'Due personal mistakes, opening gaps, and plan positions. Retrieval first, explanation second, check third.'
    ),
    section(
      'wednesday',
      'pawn_structures_book_study',
      'Stretch 17:00-17:40 Pawn Structures Book Study',
      40,
      'Optional stretch block, 17:00-17:40',
      'Pawn Structures book + IRL notes',
      'Work from the pawn structures book/material. Use a structure from your recent games or repertoire; map pawn breaks, piece placement, good/bad trades, and typical endgames.'
    )
  ]),
  outline('thursday', 'Thursday - Rapid plus opening repair', [
    section(
      'thursday',
      'woodpecker_tactics_review',
      'Core 10:30-10:50 Woodpecker Tactics Review',
      20,
      'Core block, 10:30-10:50',
      'Chessable Woodpecker',
      'Daily tactical hygiene. Aim for clean decisions rather than puzzle ego.',
      [CHESSABLE_REVIEW_LINK]
    ),
    section(
      'thursday',
      'new_woodpecker_tactics',
      'Core 10:50-11:05 New Woodpecker Tactics',
      15,
      'Core block, 10:50-11:05',
      'Chessable Woodpecker',
      'Small new-tactics intake. Stop the moment you start guessing or speeding through themes.',
      [CHESSABLE_COURSES_LINK]
    ),
    section(
      'thursday',
      'serious_rapid_game',
      'Core 11:15-12:15 Serious Rapid Game',
      60,
      'Core block, 11:15-12:15',
      'Chess.com / board',
      'Play one serious game. Use the clock to calculate and prevent drifting after reaching a good position.',
      [CHESSCOM_PLAY_LINK]
    ),
    section(
      'thursday',
      'immediate_no_engine_review',
      'Core 12:15-12:30 Immediate No-Engine Review',
      15,
      'Core block, 12:15-12:30',
      'Board + En Croissant fork notes',
      'Mark turning points, missed candidates, lazy simplifications, conversion issues, and time-pressure mistakes.'
    ),
    section(
      'thursday',
      'opening_gap_finder',
      'Core 17:00-17:25 Opening Gap Finder',
      25,
      'Core block, 17:00-17:25',
      'En Croissant fork - Opening Gap Finder + DB/ChessDB',
      'Patch a line from your games or likely repertoire. Compare engine preference, practical win rate, and common human errors; send the repair to SRS.'
    ),
    section(
      'thursday',
      'srs_mistake_review',
      'Stretch 17:25-17:50 SRS Mistake Review',
      25,
      'Optional stretch block, 17:25-17:50',
      'En Croissant fork - SRS / Mistake Trainer',
      'Review due personal mistakes and repaired gaps. Focus on recall, candidate discipline, and the exact failure tag.'
    ),
    section(
      'thursday',
      'mini_visualisation',
      'Stretch 18:00-18:15 Mini Visualisation',
      15,
      'Optional stretch block, 18:00-18:15',
      'Blindfold / visualisation',
      'Recall piece placement or calculate short lines without a board. Stop while it still feels sharp.'
    )
  ]),
  outline('friday', 'Friday - Review, conversion, and calculation day', [
    section(
      'friday',
      'woodpecker_tactics_review',
      'Core 10:30-10:50 Woodpecker Tactics Review',
      20,
      'Core block, 10:30-10:50',
      'Chessable Woodpecker',
      'Almost-daily tactics contact. Prioritise motifs that punish tactical blindness and missed defensive resources.',
      [CHESSABLE_REVIEW_LINK]
    ),
    section(
      'friday',
      'mistake_trainer_long_think',
      'Core 10:55-11:40 Mistake Trainer Long Think',
      45,
      'Core block, 10:55-11:40',
      'En Croissant fork - Mistake Trainer',
      'Work personal positions slowly. Name the error before engine confirmation: calculation failure, wrong candidate set, misevaluation, bad simplification, or conversion failure.'
    ),
    section(
      'friday',
      'phase_filter_review',
      'Core 11:45-12:10 Phase Filter Review',
      25,
      'Core block, 11:45-12:10',
      'En Croissant fork - phase filter',
      "Check whether this week's errors are mainly opening, middlegame, endgame, conversion, or time-pressure related. Choose the next repair theme."
    ),
    section(
      'friday',
      'endgame_conversion',
      'Core 12:10-12:40 Endgame Conversion',
      30,
      'Core block, 12:10-12:40',
      'Aagaard Endgame Play',
      'Small-edge conversion, defensive resources, and simplification decisions - the grinder tax department.',
      [CHESSABLE_COURSES_LINK]
    ),
    section(
      'friday',
      'aagaard_calculation',
      'Core 17:00-17:45 Aagaard Calculation',
      45,
      'Core block, 17:00-17:45',
      'Aagaard Calculation',
      'Second deep-calculation session of the week. Keep the discipline brutal: candidates first, lines second, evaluation last, no board-moving.',
      [CHESSABLE_COURSES_LINK]
    )
  ]),
  outline('saturday', 'Saturday - Full loop and deeper review', [
    section(
      'saturday',
      'woodpecker_tactics_review',
      'Core 10:30-10:50 Woodpecker Tactics Review',
      20,
      'Core block, 10:30-10:50',
      'Chessable Woodpecker',
      'Daily tactical contact before the main game.',
      [CHESSABLE_REVIEW_LINK]
    ),
    section(
      'saturday',
      'new_woodpecker_tactics',
      'Core 10:50-11:05 New Woodpecker Tactics',
      15,
      'Core block, 10:50-11:05',
      'Chessable Woodpecker',
      'Controlled new tactical intake. Learn motifs; do not farm dopamine.',
      [CHESSABLE_COURSES_LINK]
    ),
    section(
      'saturday',
      'serious_rapid_game',
      'Core 11:15-12:25 Serious Rapid Game',
      70,
      'Core block, 11:15-12:25',
      'Chess.com / board',
      "The week's best candidate for a slower game. If you play 30+20 or 30+30, use the extra time as stretch rather than rushing review.",
      [CHESSCOM_PLAY_LINK]
    ),
    section(
      'saturday',
      'immediate_no_engine_review',
      'Core 12:25-12:45 Immediate No-Engine Review',
      20,
      'Core block, 12:25-12:45',
      'Board + En Croissant fork notes',
      'Capture your thinking before the engine overwrites memory. Identify where process slipped.'
    ),
    section(
      'saturday',
      'engine_app_assisted_review',
      'Core 14:30-15:05 Engine/App-Assisted Review',
      35,
      'Core block, 14:30-15:05',
      'En Croissant fork - Mistake Finder + engine + database',
      "Do the week's deeper review. Extract mistakes, compare plans, check database/engine context, and create training positions."
    ),
    section(
      'saturday',
      'mistake_trainer_repair',
      'Core 15:05-15:30 Mistake Trainer Repair',
      25,
      'Core block, 15:05-15:30',
      'En Croissant fork - Mistake Trainer',
      'Long-think the newly extracted positions. Focus on the failure mode that actually cost the game.'
    ),
    section(
      'saturday',
      'prep_builder_or_model_game',
      'Stretch 19:00-19:45 Prep Builder or Model Game',
      45,
      'Optional stretch block, 19:00-19:45',
      'En Croissant fork - Prep Builder / Master Games Search',
      'Use Prep Builder only for a known opponent or event; otherwise study model games from your current structure.'
    )
  ]),
  outline('sunday', 'Sunday - Reset, visualisation, and exact positional review', [
    section(
      'sunday',
      'woodpecker_tactics_review',
      'Core 10:30-10:50 Woodpecker Tactics Review',
      20,
      'Core block, 10:30-10:50',
      'Chessable Woodpecker',
      'Keep the streak alive and prevent Monday rust.',
      [CHESSABLE_REVIEW_LINK]
    ),
    section(
      'sunday',
      'full_blindfold_game',
      'Core 10:55-11:30 Full Blindfold Game',
      35,
      'Core block, 10:55-11:30',
      'Blindfold / online / board',
      'One full blindfold game or serious blindfold training session. Capped because it is mentally expensive.'
    ),
    section(
      'sunday',
      'blindfold_debrief',
      'Core 11:30-11:40 Blindfold Debrief',
      10,
      'Core block, 11:30-11:40',
      'En Croissant fork notes / notebook',
      'Record visualisation breakdowns, missed piece locations, and fatigue points.'
    ),
    section(
      'sunday',
      'positional_patterns_manual_review',
      'Core 12:00-12:20 Positional Patterns Manual Review',
      20,
      'Core block, 12:00-12:20',
      'Chessable - Positional Patterns Manual',
      'Review completed course material from last summer. Focus on the cue, the plan, and where the pattern appears in your own repertoire.',
      [CHESSABLE_REVIEW_LINK]
    ),
    section(
      'sunday',
      'positional_woodpecker_review',
      'Core 12:20-12:40 Positional Woodpecker Review',
      20,
      'Core block, 12:20-12:40',
      'Chessable - Positional Woodpecker completed puzzles',
      'Repeat previously completed positional puzzles. Focus on recognition triggers: improving worst piece, pawn-break timing, prophylaxis, and conversion plans.',
      [CHESSABLE_REVIEW_LINK]
    ),
    section(
      'sunday',
      'weekly_review',
      'Core 17:00-17:25 Weekly Review',
      25,
      'Core block, 17:00-17:25',
      'En Croissant fork dashboard + notebook',
      "Check quotas, top failure tags, phase distribution, opening gaps, SRS load, and next week's priority."
    ),
    section(
      'sunday',
      'new_positional_woodpecker_puzzles',
      'Stretch 17:25-17:45 New Positional Woodpecker Puzzles',
      20,
      'Optional stretch block, 17:25-17:45',
      'Chessable - Positional Woodpecker new material',
      'Learn new positional puzzle material in a short window. Explain the principle before moving on; stop before autopilot.',
      [CHESSABLE_COURSES_LINK]
    )
  ])
];
