function PersoProSync() {
  var options = {
    // Events created on your work calendar (target) will have this title
    targetEventTitle: "Busy (personal calendar)",
    // How many days ahead of your source calendars to sync to your target (work) calendar.
    daysAhead: 20, // How many days ahead do you want to sync events over
    // When set to true, all day events in the source calendars are ignored
    ignoreAllDayEvents: true,
    // If you grant full event visibility of your personal calendars to your
    // work calendar, setting this to true will add the source event's title to
    // the description of the event in the target calendar.
    titleToDescription: false,
    // Set this to true to help with debugging
    verbose: false,
  };

  // Calendar IDs are strings and will either be your gmail email address or
  // ID@group.calendar.google.com where ID looks like a SHA-256 hex string.
  //
  // An array of the calendar ID strings for your personal calendars.
  // These will be the source of events copied over to the target calendar.
  var sourceCalendars = [];

  // The string calendar ID for your work calendar. This is the target calendar.
  // Events will be copied from the source calendars to the target calendar.
  var targetCalendar = "";

  DoSync(sourceCalendars, targetCalendar, options);
}

// DoSync - For all events in fromcals, create block events in tocal
function DoSync(fromcals, tocal, options) {
  options.id_key = "PersoProSyncId";
  var today = new Date();
  var enddate = new Date();
  enddate.setDate(today.getDate() + options.daysAhead);

  var sourceEvents = [];
  for (let cal in fromcals) {
    sourceEvents = sourceEvents.concat(
      CalendarApp.getCalendarById(fromcals[cal]).getEvents(today, enddate),
    );
  }

  var sourceEventsById = make_id_map(sourceEvents, (e) => e.getId());

  var targetCal = CalendarApp.getCalendarById(tocal);

  var targetEvents = targetCal
    .getEvents(today, enddate)
    .filter((e) => e.getTag(options.id_key) != null);

  var targetEventsBySourceId = make_id_map(targetEvents, (e) =>
    e.getTag(options.id_key),
  );

  options["log"] = {
    eventsDeleted: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
  };

  if (options.verbose) {
    Logger.log("Number of targetEvents: " + targetEvents.length);
    Logger.log("Number of sourceEvents: " + sourceEvents.length);
  }

  removeDeletedSourceEvents(sourceEventsById, targetEventsBySourceId, options);

  createOrUpdateTargetEvents(
    targetCal,
    sourceEventsById,
    targetEventsBySourceId,
    options,
  );

  if (options.verbose) {
    Logger.log("Target events created: " + options.log.eventsCreated);
    Logger.log("Target events updated: " + options.log.eventsUpdated);
    Logger.log("Target events deleted: " + options.log.eventsDeleted);
  }
}

function createOrUpdateTargetEvents(
  targetCal,
  sourceEventMap,
  targetEventMap,
  options,
) {
  for (let sourceId in sourceEventMap) {
    var sourceEvent = sourceEventMap[sourceId];
    if (options.ignoreAllDayEvents && sourceEvent.isAllDayEvent()) continue;

    var startTime = sourceEvent.getStartTime();
    var endTime = sourceEvent.getEndTime();

    // Previously sync'd?
    if (sourceId in targetEventMap) {
      var targetEvent = targetEventMap[sourceId];

      // Check if anything changed since the last script run
      if (!targetEventNeedsUpdate(sourceEvent, targetEvent, options)) {
        continue;
      }

      targetEvent.setTime(startTime, endTime);
      if (options.titleToDescription) {
        targetEvent.setDescription(sourceEvent.getTitle());
      }

      if (options.verbose) {
        options.log.eventsUpdated++;
        Logger.log("EVENT UPDATED: " + sourceEvent.getTitle());
      }
    } else {
      // create a new sync'd event
      targetEvent = targetCal.createEvent(
        options.targetEventTitle,
        startTime,
        endTime,
      );
      targetEvent.setTag(options.id_key, sourceEvent.getId());
      targetEvent.setVisibility(CalendarApp.Visibility.PRIVATE);
      targetEvent.removeAllReminders();
      if (options.titleToDescription) {
        targetEvent.setDescription(sourceEvent.getTitle());
      }
      if (options.verbose) {
        options.log.eventsCreated++;
        Logger.log("EVENT CREATED: " + sourceEvent.getTitle());
      }
    }
  }
}

function targetEventNeedsUpdate(sourceEvent, targetEvent, options) {
  var sourceUpdatedAt = sourceEvent.getLastUpdated().getTime();
  var targetUpdatedAt = targetEvent.getLastUpdated().getTime();
  var needsUpdate = sourceUpdatedAt > targetUpdatedAt;

  if (!needsUpdate && options.verbose) {
    Logger.log("EVENT UNCHANGED: " + sourceEvent.getTitle());
  }
  return needsUpdate;
}

function removeDeletedSourceEvents(sourceEventMap, targetEventMap, options) {
  for (let id in targetEventMap) {
    if (!(id in sourceEventMap)) {
      var rmEvent = targetEventMap[id];
      if (options.verbose) {
        Logger.log("EVENT DELETED: " + id);
        options.log.eventsDeleted++;
      }
      rmEvent.deleteEvent();
    }
  }
}

function make_id_map(events, idFun = (e) => e.getId()) {
  var eventsById = {};
  for (let idx in events) {
    var event = events[idx];
    eventsById[idFun(event)] = event;
  }
  return eventsById;
}
