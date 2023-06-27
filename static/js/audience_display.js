// Copyright 2014 Team 254. All Rights Reserved.
// Author: pat@patfairbank.com (Patrick Fairbank)
// Author: nick@team254.com (Nick Eyre)
//
// Client-side methods for the audience display.

var websocket;
let transitionMap;
const transitionQueue = [];
let transitionInProgress = false;
let currentScreen = "blank";
let redSide;
let blueSide;
let currentMatch;
let overlayCenteringHideParams;
let overlayCenteringShowParams;
const allianceSelectionTemplate = Handlebars.compile($("#allianceSelectionTemplate").html());
const sponsorImageTemplate = Handlebars.compile($("#sponsorImageTemplate").html());
const sponsorTextTemplate = Handlebars.compile($("#sponsorTextTemplate").html());

// Constants for overlay positioning. The CSS is the source of truth for the values that represent initial state.
const overlayCenteringTopUp = "-130px";
const overlayCenteringBottomHideParams = {queue: false, bottom: $("#overlayCentering").css("bottom")};
const overlayCenteringBottomShowParams = {queue: false, bottom: "0px"};
const overlayCenteringTopHideParams = {queue: false, top: overlayCenteringTopUp};
const overlayCenteringTopShowParams = {queue: false, top: "50px"};
const eventMatchInfoDown = "30px";
const eventMatchInfoUp = $("#eventMatchInfo").css("height");
const logoUp = "30px";
const logoDown = $("#logo").css("top");
const scoreIn = $(".score").css("width");
const scoreMid = "185px";
const scoreOut = "425px";
const scoreFieldsOut = "210px";
const scoreLogoTop = "-450px";
const bracketLogoTop = "-780px";
const bracketLogoScale = 0.75;
const timeoutDetailsIn = $("#timeoutDetails").css("width");
const timeoutDetailsOut = "570px";

// Handles a websocket message to change which screen is displayed.
const handleAudienceDisplayMode = function(targetScreen) {
  transitionQueue.push(targetScreen);
  executeTransitionQueue();
};

// Sequentially executes all transitions in the queue. Returns without doing anything if another invocation is already
// in progress.
const executeTransitionQueue = function() {
  if (transitionInProgress) {
    // There is an existing invocation of this method which will execute all transitions in the queue.
    return;
  }

  if (transitionQueue.length > 0) {
    transitionInProgress = true;
    const targetScreen = transitionQueue.shift();
    const callback = function() {
      // When the current transition is complete, call this method again to invoke the next one in the queue.
      currentScreen = targetScreen;
      transitionInProgress = false;
      setTimeout(executeTransitionQueue, 100);  // A small delay is needed to avoid visual glitches.
    };

    if (targetScreen === currentScreen) {
      callback();
      return;
    }

    if (targetScreen === "sponsor") {
      initializeSponsorDisplay();
    }

    let transitions = transitionMap[currentScreen][targetScreen];
    if (transitions !== undefined) {
      transitions(callback);
    } else {
      // There is no direct transition defined; need to go to the blank screen first.
      transitionMap[currentScreen]["blank"](function() {
        transitionMap["blank"][targetScreen](callback);
      });
    }
  }
};

// Handles a websocket message to update the teams for the current match.
const handleMatchLoad = function(data) {
  currentMatch = data.Match;
  $("#" + redSide + "Team1").text(currentMatch.Red1);
  $("#" + redSide + "Team2").text(currentMatch.Red2);
  $("#" + redSide + "Team3").text(currentMatch.Red3);
  $("#" + redSide + "Team1Avatar").attr("src", getAvatarUrl(currentMatch.Red1));
  $("#" + redSide + "Team2Avatar").attr("src", getAvatarUrl(currentMatch.Red2));
  $("#" + redSide + "Team3Avatar").attr("src", getAvatarUrl(currentMatch.Red3));
  $("#" + blueSide + "Team1").text(currentMatch.Blue1);
  $("#" + blueSide + "Team2").text(currentMatch.Blue2);
  $("#" + blueSide + "Team3").text(currentMatch.Blue3);
  $("#" + blueSide + "Team1Avatar").attr("src", getAvatarUrl(currentMatch.Blue1));
  $("#" + blueSide + "Team2Avatar").attr("src", getAvatarUrl(currentMatch.Blue2));
  $("#" + blueSide + "Team3Avatar").attr("src", getAvatarUrl(currentMatch.Blue3));

  // Show alliance numbers if this is a playoff match.
  if (currentMatch.Type === matchTypePlayoff) {
    $("#" + redSide + "PlayoffAlliance").text(currentMatch.PlayoffRedAlliance);
    $("#" + blueSide + "PlayoffAlliance").text(currentMatch.PlayoffBlueAlliance);
    $(".playoff-alliance").show();

    // Show the series status if this playoff round isn't just a single match.
    if (data.Matchup.NumWinsToAdvance > 1) {
      $("#" + redSide + "PlayoffAllianceWins").text(data.Matchup.RedAllianceWins);
      $("#" + blueSide + "PlayoffAllianceWins").text(data.Matchup.BlueAllianceWins);
      $("#playoffSeriesStatus").css("display", "flex");
    } else {
      $("#playoffSeriesStatus").hide();
    }
  } else {
    $("#" + redSide + "PlayoffAlliance").text("");
    $("#" + blueSide + "PlayoffAlliance").text("");
    $(".playoff-alliance").hide();
    $("#playoffSeriesStatus").hide();
  }

  let matchName = data.Match.LongName;
  if (data.Match.NameDetail !== "") {
    matchName += " &ndash; " + data.Match.NameDetail;
  }
  $("#matchName").html(matchName);
  $("#timeoutNextMatchName").html(matchName);
  $("#timeoutBreakDescription").text(data.BreakDescription);
};

// Handles a websocket message to update the match time countdown.
const handleMatchTime = function(data) {
  translateMatchTime(data, function(matchState, matchStateText, countdownSec) {
    let countdownString = String(countdownSec % 60);
    if (countdownString.length === 1) {
      countdownString = "0" + countdownString;
    }
    countdownString = Math.floor(countdownSec / 60) + ":" + countdownString;
    $("#matchTime").text(countdownString);
  });
};

// Handles a websocket message to update the match score.
const handleRealtimeScore = function(data) {
  $("#" + redSide + "ScoreNumber").text(data.Red.ScoreSummary.Score - data.Red.ScoreSummary.EndgamePoints);
  $("#" + blueSide + "ScoreNumber").text(data.Blue.ScoreSummary.Score - data.Blue.ScoreSummary.EndgamePoints);

  $("#" + redSide + "LinkNumerator").text(data.Red.ScoreSummary.NumLinks);
  $("#" + redSide + "LinkDenominator").text(data.Red.ScoreSummary.NumLinksGoal);
  $("#" + blueSide + "LinkNumerator").text(data.Blue.ScoreSummary.NumLinks);
  $("#" + blueSide + "LinkDenominator").text(data.Blue.ScoreSummary.NumLinksGoal);
  if (currentMatch.Type === matchTypePlayoff) {
    $("#" + redSide + "LinkDenominator").hide();
    $("#" + blueSide + "LinkDenominator").hide();
    $(".link-splitter").hide();
  } else {
    $("#" + redSide + "LinkDenominator").show();
    $("#" + blueSide + "LinkDenominator").show();
    $(".link-splitter").show();
  }

  fetch("/api/grid/red/svg")
    .then(response => response.text())
    .then(svg => $(`#${redSide}Grid`).html(svg));
  fetch("/api/grid/blue/svg")
    .then(response => response.text())
    .then(svg => $(`#${blueSide}Grid`).html(svg));
};

// Handles a websocket message to populate the final score data.
const handleScorePosted = function(data) {
  $("#" + redSide + "FinalScore").text(data.RedScoreSummary.Score);
  $("#" + redSide + "FinalAlliance").text("Alliance " + data.Match.PlayoffRedAlliance);
  setTeamInfo(redSide, 1, data.Match.Red1, data.RedRankings);
  setTeamInfo(redSide, 2, data.Match.Red2, data.RedRankings);
  setTeamInfo(redSide, 3, data.Match.Red3, data.RedRankings);
  if (data.RedOffFieldTeamIds.length > 0) {
    setTeamInfo(redSide, 4, data.RedOffFieldTeamIds[0], data.RedRankings);
  } else {
    setTeamInfo(redSide, 4, 0, data.RedRankings);
  }
  $("#" + redSide + "FinalMobilityPoints").text(data.RedScoreSummary.MobilityPoints);
  $("#" + redSide + "FinalGridPoints").text(data.RedScoreSummary.GridPoints);
  $("#" + redSide + "FinalChargeStationPoints").text(data.RedScoreSummary.ChargeStationPoints);
  $("#" + redSide + "FinalParkPoints").text(data.RedScoreSummary.ParkPoints);
  $("#" + redSide + "FinalFoulPoints").text(data.RedScoreSummary.FoulPoints);
  $("#" + redSide + "FinalSustainabilityBonusRankingPoint").html(
    data.RedScoreSummary.SustainabilityBonusRankingPoint ? "&#x2714;" : "&#x2718;"
  );
  $("#" + redSide + "FinalSustainabilityBonusRankingPoint").attr(
    "data-checked", data.RedScoreSummary.SustainabilityBonusRankingPoint
  );
  $("#" + redSide + "FinalActivationBonusRankingPoint").html(
    data.RedScoreSummary.ActivationBonusRankingPoint ? "&#x2714;" : "&#x2718;"
  );
  $("#" + redSide + "FinalActivationBonusRankingPoint").attr(
    "data-checked", data.RedScoreSummary.ActivationBonusRankingPoint
  );
  $("#" + redSide + "FinalRankingPoints").html(data.RedRankingPoints);

  $("#" + blueSide + "FinalScore").text(data.BlueScoreSummary.Score);
  $("#" + blueSide + "FinalAlliance").text("Alliance " + data.Match.PlayoffBlueAlliance);
  setTeamInfo(blueSide, 1, data.Match.Blue1, data.BlueRankings);
  setTeamInfo(blueSide, 2, data.Match.Blue2, data.BlueRankings);
  setTeamInfo(blueSide, 3, data.Match.Blue3, data.BlueRankings);
  if (data.BlueOffFieldTeamIds.length > 0) {
    setTeamInfo(blueSide, 4, data.BlueOffFieldTeamIds[0], data.BlueRankings);
  } else {
    setTeamInfo(blueSide, 4, 0, data.BlueRankings);
  }
  $("#" + blueSide + "FinalMobilityPoints").text(data.BlueScoreSummary.MobilityPoints);
  $("#" + blueSide + "FinalGridPoints").text(data.BlueScoreSummary.GridPoints);
  $("#" + blueSide + "FinalChargeStationPoints").text(data.BlueScoreSummary.ChargeStationPoints);
  $("#" + blueSide + "FinalParkPoints").text(data.BlueScoreSummary.ParkPoints);
  $("#" + blueSide + "FinalFoulPoints").text(data.BlueScoreSummary.FoulPoints);
  $("#" + blueSide + "FinalSustainabilityBonusRankingPoint").html(
    data.BlueScoreSummary.SustainabilityBonusRankingPoint ? "&#x2714;" : "&#x2718;"
  );
  $("#" + blueSide + "FinalSustainabilityBonusRankingPoint").attr(
    "data-checked", data.BlueScoreSummary.SustainabilityBonusRankingPoint
  );
  $("#" + blueSide + "FinalActivationBonusRankingPoint").html(
    data.BlueScoreSummary.ActivationBonusRankingPoint ? "&#x2714;" : "&#x2718;"
  );
  $("#" + blueSide + "FinalActivationBonusRankingPoint").attr(
    "data-checked", data.BlueScoreSummary.ActivationBonusRankingPoint
  );
  $("#" + blueSide + "FinalRankingPoints").html(data.BlueRankingPoints);
  $("#finalSeriesStatus").text(data.SeriesStatus);
  $("#finalSeriesStatus").attr("data-leader", data.SeriesLeader);
  let matchName = data.Match.LongName;
  if (data.Match.NameDetail !== "") {
    matchName += " &ndash; " + data.Match.NameDetail;
  }
  $("#finalMatchName").html(matchName);

  // Reload the bracket to reflect any changes.
  $("#bracketSvg").attr("src", "/api/bracket/svg?activeMatch=saved&v=" + new Date().getTime());

  if (data.Match.Type === matchTypePlayoff) {
    // Hide bonus ranking points and show playoff-only fields.
    $(".playoff-hidden-field").hide();
    $(".playoff-only-field").show();
  } else {
    $(".playoff-hidden-field").show();
    $(".playoff-only-field").hide();
  }
};

// Handles a websocket message to play a sound to signal match start/stop/etc.
const handlePlaySound = function(sound) {
  $("audio").each(function(k, v) {
    // Stop and reset any sounds that are still playing.
    v.pause();
    v.currentTime = 0;
  });
  $("#sound-" + sound)[0].play();
};

// Handles a websocket message to update the alliance selection screen.
const handleAllianceSelection = function(alliances) {
  if (alliances && alliances.length > 0) {
    const numColumns = alliances[0].TeamIds.length + 1;
    $.each(alliances, function(k, v) {
      v.Index = k + 1;
    });
    $("#allianceSelection").html(allianceSelectionTemplate({alliances: alliances, numColumns: numColumns}));
  }
};

// Handles a websocket message to populate and/or show/hide a lower third.
const handleLowerThird = function(data) {
  if (data.LowerThird !== null) {
    if (data.LowerThird.BottomText === "") {
      $("#lowerThirdTop").hide();
      $("#lowerThirdBottom").hide();
      $("#lowerThirdSingle").text(data.LowerThird.TopText);
      $("#lowerThirdSingle").show();
    } else {
      $("#lowerThirdSingle").hide();
      $("#lowerThirdTop").text(data.LowerThird.TopText);
      $("#lowerThirdBottom").text(data.LowerThird.BottomText);
      $("#lowerThirdTop").show();
      $("#lowerThirdBottom").show();
    }
  }

  const lowerThirdElement = $("#lowerThird");
  if (data.ShowLowerThird && !lowerThirdElement.is(":visible")) {
    lowerThirdElement.show();
    lowerThirdElement.transition({queue: false, left: "150px"}, 750, "ease");
  } else if (!data.ShowLowerThird && lowerThirdElement.is(":visible")) {
    lowerThirdElement.transition({queue: false, left: "-1000px"}, 1000, "ease", function () {
      lowerThirdElement.hide();
    });
  }
};

const transitionAllianceSelectionToBlank = function(callback) {
  $('#allianceSelectionCentering').transition({queue: false, right: "-60em"}, 500, "ease", callback);
};

const transitionBlankToAllianceSelection = function(callback) {
  $('#allianceSelectionCentering').css("right","-60em").show();
  $('#allianceSelectionCentering').transition({queue: false, right: "3em"}, 500, "ease", callback);
};

const transitionBlankToBracket = function(callback) {
  transitionBlankToLogo(function() {
    setTimeout(function() { transitionLogoToBracket(callback); }, 50);
  });
};

const transitionBlankToIntro = function(callback) {
  $("#overlayCentering").transition(overlayCenteringShowParams, 500, "ease", function() {
    $(".teams").css("display", "flex");
    $(".avatars").css("display", "flex");
    $(".avatars").css("opacity", 1);
    $(".score").transition({queue: false, width: scoreMid}, 500, "ease", function() {
      $("#eventMatchInfo").css("display", "flex");
      $("#eventMatchInfo").transition({queue: false, height: eventMatchInfoDown}, 500, "ease", callback);
    });
  });
};

const transitionBlankToLogo = function(callback) {
  $(".blindsCenter.blank").css({rotateY: "0deg"});
  $(".blindsCenter.full").css({rotateY: "-180deg"});
  $(".blinds.right").transition({queue: false, right: 0}, 1000, "ease");
  $(".blinds.left").transition({queue: false, left: 0}, 1000, "ease", function() {
    $(".blinds.left").addClass("full");
    $(".blinds.right").hide();
    setTimeout(function() {
      $(".blindsCenter.blank").transition({queue: false, rotateY: "180deg"}, 500, "ease");
      $(".blindsCenter.full").transition({queue: false, rotateY: "0deg"}, 500, "ease", callback);
    }, 200);
  });
};

const transitionBlankToLogoLuma = function(callback) {
  $(".blindsCenter.blank").css({rotateY: "180deg"});
  $(".blindsCenter.full").transition({ queue: false, rotateY: "0deg" }, 1000, "ease", callback);
};

const transitionBlankToMatch = function(callback) {
  $("#overlayCentering").transition(overlayCenteringShowParams, 500, "ease", function() {
    $(".teams").css("display", "flex");
    $(".score-fields").css("display", "flex");
    $(".score-fields").transition({queue: false, width: scoreFieldsOut}, 500, "ease");
    $("#logo").transition({queue: false, top: logoUp}, 500, "ease");
    $(".score").transition({queue: false, width: scoreOut}, 500, "ease", function() {
      $("#eventMatchInfo").css("display", "flex");
      $("#eventMatchInfo").transition({queue: false, height: eventMatchInfoDown}, 500, "ease", callback);
      $(".score-number").transition({queue: false, opacity: 1}, 750, "ease");
      $("#matchTime").transition({queue: false, opacity: 1}, 750, "ease");
      $(".score-fields").transition({queue: false, opacity: 1}, 750, "ease");
    });
  });
};

const transitionBlankToScore = function(callback) {
  transitionBlankToLogo(function() {
    setTimeout(function() { transitionLogoToScore(callback); }, 50);
  });
};

const transitionBlankToSponsor = function(callback) {
  $(".blindsCenter.blank").css({rotateY: "90deg"});
  $(".blinds.right").transition({queue: false, right: 0}, 1000, "ease");
  $(".blinds.left").transition({queue: false, left: 0}, 1000, "ease", function() {
    $(".blinds.left").addClass("full");
    $(".blinds.right").hide();
    setTimeout(function() {
      $("#sponsor").show();
      $("#sponsor").transition({queue: false, opacity: 1}, 1000, "ease", callback);
    }, 200);
  });
};

const transitionBlankToTimeout = function(callback) {
  $("#overlayCentering").transition(overlayCenteringShowParams, 500, "ease", function () {
    $("#timeoutDetails").transition({queue: false, width: timeoutDetailsOut}, 500, "ease");
    $("#logo").transition({queue: false, top: logoUp}, 500, "ease", function() {
      $(".timeout-detail").transition({queue: false, opacity: 1}, 750, "ease");
      $("#matchTime").transition({queue: false, opacity: 1}, 750, "ease", callback);
    });
  });
};

const transitionBracketToBlank = function(callback) {
  transitionBracketToLogo(function() {
    transitionLogoToBlank(callback);
  });
};

const transitionBracketToLogo = function(callback) {
  $("#bracket").transition({queue: false, opacity: 0}, 500, "ease", function(){
    $("#bracket").hide();
  });
  $(".blindsCenter.full").transition({queue: false, top: 0, scale: 1}, 625, "ease", callback);
};

const transitionBracketToLogoLuma = function(callback) {
  transitionBracketToLogo(function() {
    transitionLogoToLogoLuma(callback);
  });
};

const transitionBracketToScore = function(callback) {
  $(".blindsCenter.full").transition({queue: false, top: scoreLogoTop, scale: 1}, 1000, "ease");
  $("#bracket").transition({queue: false, opacity: 0}, 1000, "ease", function(){
    $("#bracket").hide();
    $("#finalScore").show();
    $("#finalScore").transition({queue: false, opacity: 1}, 1000, "ease", callback);
  });
};

const transitionBracketToSponsor = function(callback) {
  transitionBracketToLogo(function() {
    transitionLogoToSponsor(callback);
  });
};

const transitionIntroToBlank = function(callback) {
  $("#eventMatchInfo").transition({queue: false, height: eventMatchInfoUp}, 500, "ease", function() {
    $("#eventMatchInfo").hide();
    $(".score").transition({queue: false, width: scoreIn}, 500, "ease", function() {
      $(".avatars").css("opacity", 0);
      $(".avatars").hide();
      $(".teams").hide();
      $("#overlayCentering").transition(overlayCenteringHideParams, 1000, "ease", callback);
    });
  });
};

const transitionIntroToMatch = function(callback) {
  $(".avatars").transition({queue: false, opacity: 0}, 500, "ease", function() {
    $(".avatars").hide();
  });
  $(".score-fields").css("display", "flex");
  $(".score-fields").transition({queue: false, width: scoreFieldsOut}, 500, "ease");
  $("#logo").transition({queue: false, top: logoUp}, 500, "ease");
  $(".score").transition({queue: false, width: scoreOut}, 500, "ease", function() {
    $(".score-number").transition({queue: false, opacity: 1}, 750, "ease");
    $("#matchTime").transition({queue: false, opacity: 1}, 750, "ease", callback);
    $(".score-fields").transition({queue: false, opacity: 1}, 750, "ease");
  });
};

const transitionIntroToTimeout = function(callback) {
  $("#eventMatchInfo").transition({queue: false, height: eventMatchInfoUp}, 500, "ease", function() {
    $("#eventMatchInfo").hide();
    $(".score").transition({queue: false, width: scoreIn}, 500, "ease", function() {
      $(".avatars").css("opacity", 0);
      $(".avatars").hide();
      $(".teams").hide();
      $("#timeoutDetails").transition({queue: false, width: timeoutDetailsOut}, 500, "ease");
      $("#logo").transition({queue: false, top: logoUp}, 500, "ease", function() {
        $(".timeout-detail").transition({queue: false, opacity: 1}, 750, "ease");
        $("#matchTime").transition({queue: false, opacity: 1}, 750, "ease", callback);
      });
    });
  });
};

const transitionLogoToBlank = function(callback) {
  $(".blindsCenter.blank").transition({queue: false, rotateY: "360deg"}, 500, "ease");
  $(".blindsCenter.full").transition({queue: false, rotateY: "180deg"}, 500, "ease", function() {
    setTimeout(function() {
      $(".blinds.left").removeClass("full");
      $(".blinds.right").show();
      $(".blinds.right").transition({queue: false, right: "-50%"}, 1000, "ease");
      $(".blinds.left").transition({queue: false, left: "-50%"}, 1000, "ease", callback);
    }, 200);
  });
};

const transitionLogoToBracket = function(callback) {
  $(".blindsCenter.full").transition({queue: false, top: bracketLogoTop, scale: bracketLogoScale}, 625, "ease");
  $("#bracket").show();
  $("#bracket").transition({queue: false, opacity: 1}, 1000, "ease", callback);
};

const transitionLogoToLogoLuma = function(callback) {
  $(".blinds.left").removeClass("full");
  $(".blinds.right").show();
  $(".blinds.right").transition({queue: false, right: "-50%"}, 1000, "ease");
  $(".blinds.left").transition({queue: false, left: "-50%"}, 1000, "ease", function() {
    if (callback) {
      callback();
    }
  });
};

const transitionLogoToScore = function(callback) {
  $(".blindsCenter.full").transition({queue: false, top: scoreLogoTop}, 625, "ease");
  $("#finalScore").show();
  $("#finalScore").transition({queue: false, opacity: 1}, 1000, "ease", callback);
};

const transitionLogoToSponsor = function(callback) {
  $(".blindsCenter.full").transition({queue: false, rotateY: "90deg"}, 750, "ease", function () {
    $("#sponsor").show();
    $("#sponsor").transition({queue: false, opacity: 1}, 1000, "ease", callback);
  });
};

const transitionLogoLumaToBlank = function(callback) {
  $(".blindsCenter.full").transition({queue: false, rotateY: "180deg"}, 1000, "ease", callback);
};

const transitionLogoLumaToBracket = function(callback) {
  transitionLogoLumaToLogo(function() {
    transitionLogoToBracket(callback);
  });
};

const transitionLogoLumaToLogo = function(callback) {
  $(".blinds.right").transition({queue: false, right: 0}, 1000, "ease");
  $(".blinds.left").transition({queue: false, left: 0}, 1000, "ease", function() {
    $(".blinds.left").addClass("full");
    $(".blinds.right").hide();
    if (callback) {
      callback();
    }
  });
};

const transitionLogoLumaToScore = function(callback) {
  transitionLogoLumaToLogo(function() {
    transitionLogoToScore(callback);
  });
};

const transitionMatchToBlank = function(callback) {
  $("#eventMatchInfo").transition({queue: false, height: eventMatchInfoUp}, 500, "ease");
  $("#matchTime").transition({queue: false, opacity: 0}, 300, "linear");
  $(".score-fields").transition({queue: false, opacity: 0}, 300, "ease");
  $(".score-number").transition({queue: false, opacity: 0}, 300, "linear", function() {
    $("#eventMatchInfo").hide();
    $(".score-fields").transition({queue: false, width: 0}, 500, "ease");
    $("#logo").transition({queue: false, top: logoDown}, 500, "ease");
    $(".score").transition({queue: false, width: scoreIn}, 500, "ease", function() {
      $(".teams").hide();
      $(".score-fields").hide();
      $("#overlayCentering").transition(overlayCenteringHideParams, 1000, "ease", callback);
    });
  });
};

const transitionMatchToIntro = function(callback) {
  $(".score-number").transition({queue: false, opacity: 0}, 300, "linear");
  $(".score-fields").transition({queue: false, opacity: 0}, 300, "ease");
  $("#matchTime").transition({queue: false, opacity: 0}, 300, "linear", function() {
    $(".score-fields").transition({queue: false, width: 0}, 500, "ease");
    $("#logo").transition({queue: false, top: logoDown}, 500, "ease");
    $(".score").transition({queue: false, width: scoreMid}, 500, "ease", function() {
      $(".score-fields").hide();
      $(".avatars").css("display", "flex");
      $(".avatars").transition({queue: false, opacity: 1}, 500, "ease", callback);
    });
  });
};

const transitionScoreToBlank = function(callback) {
  transitionScoreToLogo(function() {
    transitionLogoToBlank(callback);
  });
};

const transitionScoreToBracket = function(callback) {
  $(".blindsCenter.full").transition({queue: false, top: bracketLogoTop, scale: bracketLogoScale}, 1000, "ease");
  $("#finalScore").transition({queue: false, opacity: 0}, 1000, "ease", function(){
    $("#finalScore").hide();
    $("#bracket").show();
    $("#bracket").transition({queue: false, opacity: 1}, 1000, "ease", callback);
  });
};

const transitionScoreToLogo = function(callback) {
  $("#finalScore").transition({queue: false, opacity: 0}, 500, "ease", function(){
    $("#finalScore").hide();
  });
  $(".blindsCenter.full").transition({queue: false, top: 0}, 625, "ease", callback);
};

const transitionScoreToLogoLuma = function(callback) {
  transitionScoreToLogo(function() {
    transitionLogoToLogoLuma(callback);
  });
};

const transitionScoreToSponsor = function(callback) {
  transitionScoreToLogo(function() {
    transitionLogoToSponsor(callback);
  });
};

const transitionSponsorToBlank = function(callback) {
  $("#sponsor").transition({queue: false, opacity: 0}, 1000, "ease", function() {
    setTimeout(function() {
      $(".blinds.left").removeClass("full");
      $(".blinds.right").show();
      $(".blinds.right").transition({queue: false, right: "-50%"}, 1000, "ease");
      $(".blinds.left").transition({queue: false, left: "-50%"}, 1000, "ease", callback);
      $("#sponsor").hide();
    }, 200);
  });
};

const transitionSponsorToBracket = function(callback) {
  transitionSponsorToLogo(function() {
    transitionLogoToBracket(callback);
  });
};

const transitionSponsorToLogo = function(callback) {
  $("#sponsor").transition({queue: false, opacity: 0}, 1000, "ease", function() {
    $(".blindsCenter.full").transition({queue: false, rotateY: "0deg"}, 750, "ease", callback);
    $("#sponsor").hide();
  });
};

const transitionSponsorToScore = function(callback) {
  transitionSponsorToLogo(function() {
    transitionLogoToScore(callback);
  });
};

const transitionTimeoutToBlank = function(callback) {
  $(".timeout-detail").transition({queue: false, opacity: 0}, 300, "linear");
  $("#matchTime").transition({queue: false, opacity: 0}, 300, "linear", function() {
    $("#timeoutDetails").transition({queue: false, width: timeoutDetailsIn}, 500, "ease");
    $("#logo").transition({queue: false, top: logoDown}, 500, "ease", function() {
      $("#overlayCentering").transition(overlayCenteringHideParams, 1000, "ease", callback);
    });
  });
};

const transitionTimeoutToIntro = function(callback) {
  $(".timeout-detail").transition({queue: false, opacity: 0}, 300, "linear");
  $("#matchTime").transition({queue: false, opacity: 0}, 300, "linear", function() {
    $("#timeoutDetails").transition({queue: false, width: timeoutDetailsIn}, 500, "ease");
    $("#logo").transition({queue: false, top: logoDown}, 500, "ease", function() {
      $(".avatars").css("display", "flex");
      $(".avatars").css("opacity", 1);
      $(".teams").css("display", "flex");
      $(".score").transition({queue: false, width: scoreMid}, 500, "ease", function () {
        $("#eventMatchInfo").show();
        $("#eventMatchInfo").transition({queue: false, height: eventMatchInfoDown}, 500, "ease", callback);
      });
    });
  });
};

// Loads sponsor slide data and builds the slideshow HTML.
const initializeSponsorDisplay = function() {
  $.getJSON("/api/sponsor_slides", function(slides) {
    $("#sponsorContainer").empty();

    // Inject the HTML for each slide into the DOM.
    $.each(slides, function(index, slide) {
      slide.DisplayTimeMs = slide.DisplayTimeSec * 1000;
      slide.First = index === 0;

      let slideHtml;
      if (slide.Image) {
        slideHtml = sponsorImageTemplate(slide);
      } else {
        slideHtml = sponsorTextTemplate(slide);
      }
      $("#sponsorContainer").append(slideHtml);
    });

    // Start Carousel
    let t;
    const start = $('.carousel#sponsor').find('.active').attr('data-interval');
    t = setTimeout("$('.carousel#sponsor').carousel({interval: 1000});", start-1000);

    $('.carousel#sponsor').on('slid.bs.carousel', function () {   
         clearTimeout(t);  
         const duration = $(this).find('.active').attr('data-interval');

         $('.carousel#sponsor').carousel('pause');
         t = setTimeout("$('.carousel#sponsor').carousel();", duration-1000);
    });

    $('.carousel-control.right').on('click', function(){
        clearTimeout(t);   
    });

    $('.carousel-control.left').on('click', function(){
        clearTimeout(t);   
    });

  });
};

const getAvatarUrl = function(teamId) {
  return "/api/teams/" + teamId + "/avatar";
};

const setTeamInfo = function(side, position, teamId, rankings) {
  const teamNumberElement = $(`#${side}FinalTeam${position}`);
  teamNumberElement.html(teamId);
  teamNumberElement.toggle(teamId > 0);
  const avatarElement = $(`#${side}FinalTeam${position}Avatar`);
  avatarElement.attr("src", getAvatarUrl(teamId));
  avatarElement.toggle(teamId > 0);

  const ranking = rankings[teamId];
  let rankIndicator = "";
  let rankNumber = "";
  if (ranking !== undefined && ranking !== null && ranking.Rank !== 0) {
    rankNumber = ranking.Rank;
    if (rankNumber > ranking.PreviousRank && ranking.PreviousRank > 0) {
      rankIndicator = "rank-up";
    } else if (rankNumber < ranking.PreviousRank) {
      rankIndicator = "rank-down";
    }
  }

  const rankIndicatorElement = $(`#${side}FinalTeam${position}RankIndicator`);
  rankIndicatorElement.attr("src", `/static/img/${rankIndicator}.svg`);
  rankIndicatorElement.toggle(rankIndicator !== "" && teamId > 0);

  const rankNumberElement = $(`#${side}FinalTeam${position}RankNumber`);
  rankNumberElement.text(rankNumber);
  rankNumberElement.toggle(teamId > 0);
};

$(function() {
  // Read the configuration for this display from the URL query string.
  const urlParams = new URLSearchParams(window.location.search);
  document.body.style.backgroundColor = urlParams.get("background");
  const reversed = urlParams.get("reversed");
  if (reversed === "true") {
    redSide = "right";
    blueSide = "left";
  } else {
    redSide = "left";
    blueSide = "right";
  }
  $(".reversible-left").attr("data-reversed", reversed);
  $(".reversible-right").attr("data-reversed", reversed);
  if (urlParams.get("overlayLocation") === "top") {
    overlayCenteringHideParams = overlayCenteringTopHideParams;
    overlayCenteringShowParams = overlayCenteringTopShowParams;
    $("#overlayCentering").css("top", overlayCenteringTopUp);
  } else {
    overlayCenteringHideParams = overlayCenteringBottomHideParams;
    overlayCenteringShowParams = overlayCenteringBottomShowParams;
  }

  // Set up the websocket back to the server.
  websocket = new CheesyWebsocket("/displays/audience/websocket", {
    allianceSelection: function(event) { handleAllianceSelection(event.data); },
    audienceDisplayMode: function(event) { handleAudienceDisplayMode(event.data); },
    lowerThird: function(event) { handleLowerThird(event.data); },
    matchLoad: function(event) { handleMatchLoad(event.data); },
    matchTime: function(event) { handleMatchTime(event.data); },
    matchTiming: function(event) { handleMatchTiming(event.data); },
    playSound: function(event) { handlePlaySound(event.data); },
    realtimeScore: function(event) { handleRealtimeScore(event.data); },
    scorePosted: function(event) { handleScorePosted(event.data); },
  });

  // Map how to transition from one screen to another. Missing links between screens indicate that first we
  // must transition to the blank screen and then to the target screen.
  transitionMap = {
    allianceSelection: {
      blank: transitionAllianceSelectionToBlank,
    },
    blank: {
      allianceSelection: transitionBlankToAllianceSelection,
      bracket: transitionBlankToBracket,
      intro: transitionBlankToIntro,
      logo: transitionBlankToLogo,
      logoLuma: transitionBlankToLogoLuma,
      match: transitionBlankToMatch,
      score: transitionBlankToScore,
      sponsor: transitionBlankToSponsor,
      timeout: transitionBlankToTimeout,
    },
    bracket: {
      blank: transitionBracketToBlank,
      logo: transitionBracketToLogo,
      logoLuma: transitionBracketToLogoLuma,
      score: transitionBracketToScore,
      sponsor: transitionBracketToSponsor,
    },
    intro: {
      blank: transitionIntroToBlank,
      match: transitionIntroToMatch,
      timeout: transitionIntroToTimeout,
    },
    logo: {
      blank: transitionLogoToBlank,
      bracket: transitionLogoToBracket,
      logoLuma: transitionLogoToLogoLuma,
      score: transitionLogoToScore,
      sponsor: transitionLogoToSponsor,
    },
    logoLuma: {
      blank: transitionLogoLumaToBlank,
      bracket: transitionLogoLumaToBracket,
      logo: transitionLogoLumaToLogo,
      score: transitionLogoLumaToScore,
    },
    match: {
      blank: transitionMatchToBlank,
      intro: transitionMatchToIntro,
    },
    score: {
      blank: transitionScoreToBlank,
      bracket: transitionScoreToBracket,
      logo: transitionScoreToLogo,
      logoLuma: transitionScoreToLogoLuma,
      sponsor: transitionScoreToSponsor,
    },
    sponsor: {
      blank: transitionSponsorToBlank,
      bracket: transitionSponsorToBracket,
      logo: transitionSponsorToLogo,
      score: transitionSponsorToScore,
    },
    timeout: {
      blank: transitionTimeoutToBlank,
      intro: transitionTimeoutToIntro,
    },
  }
});
