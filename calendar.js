// Calendar functionality for Skillflow

(function() {
  'use strict';

  // Calendar state
  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let viewMode = 'month'; // 'month' or 'week'
  let selectedEvent = null;
  let currentTimeInterval = null; // For updating current time indicator

  // ============================================
  // MULTIPLE CALENDARS SYSTEM
  // ============================================

  // Default calendars with colors
  const DEFAULT_CALENDARS = [
    { id: 'cal_default', name: 'Default', color: '#0ea5e9', visible: true },
    { id: 'cal_work', name: 'Work', color: '#22c55e', visible: true },
    { id: 'cal_personal', name: 'Personal', color: '#a855f7', visible: true }
  ];

  // Calendar color palette
  const CALENDAR_COLORS = [
    '#0ea5e9', // Blue
    '#22c55e', // Green
    '#ef4444', // Red
    '#a855f7', // Purple
    '#f97316', // Orange
    '#ec4899', // Pink
    '#14b8a6', // Teal
    '#eab308'  // Yellow
  ];

  /**
   * Get calendars from storage
   */
  function getCalendars() {
    try {
      const stored = localStorage.getItem('calendar_categories_v1');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load calendars:', e);
    }
    return [...DEFAULT_CALENDARS];
  }

  /**
   * Save calendars to storage
   */
  function saveCalendars(calendars) {
    try {
      localStorage.setItem('calendar_categories_v1', JSON.stringify(calendars));
      if (window.markDirty) window.markDirty();
    } catch (e) {
      console.error('Failed to save calendars:', e);
    }
  }

  /**
   * Get calendar by ID
   */
  function getCalendarById(id) {
    const calendars = getCalendars();
    return calendars.find(c => c.id === id) || calendars[0];
  }

  /**
   * Get visible calendar IDs
   */
  function getVisibleCalendarIds() {
    return getCalendars().filter(c => c.visible).map(c => c.id);
  }

  /**
   * Toggle calendar visibility
   */
  function toggleCalendarVisibility(calId) {
    const calendars = getCalendars();
    const cal = calendars.find(c => c.id === calId);
    if (cal) {
      cal.visible = !cal.visible;
      saveCalendars(calendars);
      renderCalendar();
      renderCalendarList();
    }
  }

  /**
   * Add a new calendar
   */
  function addCalendar(name, color) {
    const calendars = getCalendars();
    const newCal = {
      id: 'cal_' + Date.now(),
      name: name || 'New Calendar',
      color: color || CALENDAR_COLORS[calendars.length % CALENDAR_COLORS.length],
      visible: true
    };
    calendars.push(newCal);
    saveCalendars(calendars);
    renderCalendarList();
    return newCal;
  }

  /**
   * Delete a calendar
   */
  function deleteCalendar(calId) {
    if (calId === 'cal_default') return; // Can't delete default

    const calendars = getCalendars().filter(c => c.id !== calId);
    saveCalendars(calendars);

    // Move orphaned events to default calendar
    const events = getCalendarEvents();
    events.forEach(e => {
      if (e.calendarId === calId) {
        e.calendarId = 'cal_default';
      }
    });
    saveCalendarEvents(events);

    renderCalendarList();
    renderCalendar();
  }

  /**
   * Render the calendar list in sidebar
   */
  function renderCalendarList() {
    const container = $('#calendarList');
    if (!container) return;

    const calendars = getCalendars();
    let html = '';

    calendars.forEach(cal => {
      html += `
        <div class="calendar-list-item ${cal.visible ? '' : 'hidden-calendar'}" data-cal-id="${cal.id}">
          <input type="checkbox" ${cal.visible ? 'checked' : ''} data-toggle-cal="${cal.id}"/>
          <div class="calendar-color-dot" style="background: ${cal.color}"></div>
          <span class="calendar-name">${cal.name}</span>
          ${cal.id !== 'cal_default' ? `
            <div class="calendar-actions">
              <button class="btn-xxs" data-edit-cal="${cal.id}" title="Edit">✎</button>
              <button class="btn-xxs" data-delete-cal="${cal.id}" title="Delete">×</button>
            </div>
          ` : ''}
        </div>
      `;
    });

    container.innerHTML = html;

    // Add event listeners
    container.querySelectorAll('[data-toggle-cal]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        toggleCalendarVisibility(cb.dataset.toggleCal);
      });
    });

    container.querySelectorAll('[data-delete-cal]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this calendar? Events will be moved to Default.')) {
          deleteCalendar(btn.dataset.deleteCal);
        }
      });
    });
  }

  /**
   * Populate calendar select dropdown in modal
   */
  function populateCalendarSelect() {
    const select = $('#eventCalendarSelect');
    if (!select) return;

    const calendars = getCalendars();
    let html = '';
    calendars.forEach(cal => {
      html += `<option value="${cal.id}">${cal.name}</option>`;
    });
    select.innerHTML = html;
  }

  // Helper functions
  const $ = (q) => document.querySelector(q);
  const $$ = (q) => Array.from(document.querySelectorAll(q));
  const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const SCHEDULE_DEFAULTS_KEY = 'schedule_defaults_v1';
  const modalState = {
    listenersBound: false,
    manualEndTime: false,
    manualWeekdays: false,
    lastAutoEndTime: '',
    activeQuickDate: '',
    clockRefresh: null
  };

  function getAppBridge() {
    return window.skillflowBridge || null;
  }

  function parseDateValue(dateStr) {
    return new Date(`${dateStr}T00:00:00`);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  function endOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  }

  function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function startOfWeek(date) {
    const next = startOfDay(date);
    next.setDate(next.getDate() - next.getDay());
    return next;
  }

  function daysBetween(start, end) {
    return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000);
  }

  function weeksBetween(start, end) {
    return Math.floor(daysBetween(startOfWeek(start), startOfWeek(end)) / 7);
  }

  function monthsBetween(start, end) {
    return ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth());
  }

  function formatDateStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function formatLongDate(date) {
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function formatShortDate(date) {
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function timeStringFromDate(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function addMinutesToTime(timeStr, minutesToAdd) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':').map(Number);
    const total = (hours * 60) + minutes + Math.max(0, Number(minutesToAdd) || 0);
    const wrapped = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
    const nextHours = Math.floor(wrapped / 60);
    const nextMinutes = wrapped % 60;
    return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
  }

  function roundUpToHalfHour(date) {
    const next = new Date(date);
    const step = 30;
    const bufferedMinutes = next.getMinutes() + 15;
    const roundedMinutes = Math.ceil(bufferedMinutes / step) * step;
    next.setHours(next.getHours() + Math.floor(roundedMinutes / 60), roundedMinutes % 60, 0, 0);
    return next;
  }

  function nextNamedDay(dayIndex, fromDate = new Date()) {
    const next = startOfDay(fromDate);
    const delta = (dayIndex - next.getDay() + 7) % 7 || 7;
    return addDays(next, delta);
  }

  function loadScheduleDefaults() {
    try {
      return JSON.parse(localStorage.getItem(SCHEDULE_DEFAULTS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveScheduleDefaults(nextDefaults) {
    try {
      localStorage.setItem(SCHEDULE_DEFAULTS_KEY, JSON.stringify(nextDefaults || {}));
    } catch (error) {
      console.error('Failed to save schedule defaults:', error);
    }
  }

  function getEventSpanDays(event) {
    if (!event?.endDate) return 0;
    return Math.max(0, daysBetween(parseDateValue(event.date), parseDateValue(event.endDate)));
  }

  function normalizeWeekdays(days) {
    return Array.from(new Set((Array.isArray(days) ? days : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))).sort((a, b) => a - b);
  }

  // ============================================
  // RECURRENCE LOGIC (RRULE LITE)
  // ============================================

  /**
   * Generate occurrences of a recurring event within a date range
   * @param {Object} event - The recurring event
   * @param {Date} rangeStart - Start of the date range
   * @param {Date} rangeEnd - End of the date range
   * @returns {Array} Array of event instances with their dates
   */
  function generateRecurrences(event, rangeStart, rangeEnd) {
    if (!event.recurrence) return [event];

    const rec = normalizeRecurrence(event.recurrence, event.date);
    const startDate = parseDateValue(event.date);
    const spanDays = getEventSpanDays(event);
    const effectiveStart = rec.count ? new Date(startDate) : new Date(Math.max(startDate.getTime(), startOfDay(addDays(rangeStart, -spanDays)).getTime()));
    const effectiveEnd = rec.endDate
      ? new Date(Math.min(endOfDay(parseDateValue(rec.endDate)).getTime(), rangeEnd.getTime()))
      : new Date(rangeEnd);
    const occurrences = [];
    let occurrenceCount = 0;
    let cursor = new Date(effectiveStart);
    const maxOccurrences = rec.count || 365;

    while (cursor <= effectiveEnd && occurrenceCount < maxOccurrences) {
      if (matchesRecurrenceOnDate(cursor, startDate, rec)) {
        const occurrence = buildOccurrenceInstance(event, cursor, occurrenceCount);
        const occurrenceStart = startOfDay(parseDateValue(occurrence.date));
        const occurrenceEnd = occurrence.endDate ? endOfDay(parseDateValue(occurrence.endDate)) : occurrenceStart;

        if (occurrenceEnd >= rangeStart && occurrenceStart <= rangeEnd) {
          occurrences.push(occurrence);
        }

        occurrenceCount += 1;
      }

      cursor = addDays(cursor, 1);
    }

    return occurrences;
  }

  function normalizeRecurrence(recurrence, startDateStr) {
    const startDate = parseDateValue(startDateStr);
    let interval = Math.max(1, Number(recurrence?.interval) || 1);
    let unit = recurrence?.unit || 'days';

    if (recurrence?.type) {
      switch (recurrence.type) {
        case 'daily':
          unit = 'days';
          interval = 1;
          break;
        case 'weekly':
          unit = 'weeks';
          interval = 1;
          break;
        case 'monthly':
          unit = 'months';
          interval = 1;
          break;
        case 'yearly':
          unit = 'years';
          interval = 1;
          break;
      }
    }

    const weekdays = normalizeWeekdays(recurrence?.weekdays);
    return {
      ...recurrence,
      interval,
      unit,
      weekdays: weekdays.length ? weekdays : (unit === 'weeks' ? [startDate.getDay()] : [])
    };
  }

  function matchesRecurrenceOnDate(targetDate, seriesStart, recurrence) {
    const normalizedTarget = startOfDay(targetDate);
    const normalizedStart = startOfDay(seriesStart);
    if (normalizedTarget < normalizedStart) return false;

    switch (recurrence.unit) {
      case 'days':
        return daysBetween(normalizedStart, normalizedTarget) % recurrence.interval === 0;
      case 'weeks':
        return recurrence.weekdays.includes(normalizedTarget.getDay()) &&
          weeksBetween(normalizedStart, normalizedTarget) % recurrence.interval === 0;
      case 'months': {
        const monthDiff = monthsBetween(normalizedStart, normalizedTarget);
        return monthDiff >= 0 &&
          normalizedTarget.getDate() === normalizedStart.getDate() &&
          monthDiff % recurrence.interval === 0;
      }
      case 'years': {
        const yearDiff = normalizedTarget.getFullYear() - normalizedStart.getFullYear();
        return yearDiff >= 0 &&
          normalizedTarget.getDate() === normalizedStart.getDate() &&
          normalizedTarget.getMonth() === normalizedStart.getMonth() &&
          yearDiff % recurrence.interval === 0;
      }
      default:
        return false;
    }
  }

  function buildOccurrenceInstance(event, occurrenceDate, occurrenceIndex = 0) {
    const occurrenceStart = startOfDay(occurrenceDate);
    const occurrenceDateStr = formatDateStr(occurrenceStart);
    const spanDays = getEventSpanDays(event);
    const nextEndDate = spanDays > 0 ? formatDateStr(addDays(occurrenceStart, spanDays)) : (event.endDate || null);

    return {
      ...event,
      date: occurrenceDateStr,
      endDate: nextEndDate,
      originalDate: event.date,
      instanceIndex: occurrenceIndex,
      isRecurrenceInstance: occurrenceDateStr !== event.date
    };
  }

  /**
   * Get all events for a date range, expanding recurrences
   * @param {Date} rangeStart - Start of range
   * @param {Date} rangeEnd - End of range
   * @returns {Array} All event instances in range
   */
  function getEventsInRange(rangeStart, rangeEnd) {
    const events = getCalendarEvents();
    const visibleCalIds = getVisibleCalendarIds();
    let allInstances = [];

    events.forEach(event => {
      // Filter by visible calendars
      const calId = event.calendarId || 'cal_default';
      if (!visibleCalIds.includes(calId)) return;

      if (event.recurrence) {
        const instances = generateRecurrences(event, rangeStart, rangeEnd);
        allInstances = allInstances.concat(instances);
      } else {
        // Check if event falls within range
        const eventDate = parseDateValue(event.date);
        const eventEndDate = event.endDate ? endOfDay(parseDateValue(event.endDate)) : eventDate;

        if (eventEndDate >= rangeStart && eventDate <= rangeEnd) {
          allInstances.push(event);
        }
      }
    });

    return allInstances;
  }

  /**
   * Check if an event is an all-day or multi-day event
   */
  function isAllDayEvent(event) {
    return event.allDay || (event.endDate && event.endDate !== event.date);
  }

  /**
   * Check if an event spans midnight (ends after midnight)
   */
  function spansMidnight(event) {
    if (!event.time || !event.endTime) return false;

    const startMinutes = timeToMinutes(event.time);
    const endMinutes = timeToMinutes(event.endTime);

    // If end time is before start time, it spans midnight
    return endMinutes < startMinutes;
  }

  // ============================================
  // COLLISION DETECTION ALGORITHM
  // ============================================

  /**
   * Calculate event layout positions for overlapping events
   * Uses a column-based algorithm similar to Google Calendar
   * @param {Array} events - Events to layout (must have startMinutes, endMinutes)
   * @returns {Array} Events with added layout properties (column, totalColumns)
   */
  function calculateEventLayout(events) {
    if (!events.length) return [];

    // Sort events by start time, then by duration (longer first)
    const sorted = [...events].sort((a, b) => {
      if (a.startMinutes !== b.startMinutes) {
        return a.startMinutes - b.startMinutes;
      }
      return (b.endMinutes - b.startMinutes) - (a.endMinutes - a.startMinutes);
    });

    // Find collision groups (events that overlap with each other)
    const groups = [];
    let currentGroup = [];
    let groupEnd = 0;

    sorted.forEach(event => {
      if (currentGroup.length === 0 || event.startMinutes < groupEnd) {
        // Event overlaps with current group
        currentGroup.push(event);
        groupEnd = Math.max(groupEnd, event.endMinutes);
      } else {
        // Start a new group
        if (currentGroup.length > 0) {
          groups.push([...currentGroup]);
        }
        currentGroup = [event];
        groupEnd = event.endMinutes;
      }
    });

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    // Assign columns within each group
    groups.forEach(group => {
      const columns = []; // Each column is an array of events

      group.forEach(event => {
        // Find the first column where this event doesn't overlap
        let placed = false;
        for (let col = 0; col < columns.length; col++) {
          const lastEventInCol = columns[col][columns[col].length - 1];
          if (event.startMinutes >= lastEventInCol.endMinutes) {
            // Can place in this column
            columns[col].push(event);
            event.column = col;
            placed = true;
            break;
          }
        }

        if (!placed) {
          // Need a new column
          event.column = columns.length;
          columns.push([event]);
        }
      });

      // Set total columns for all events in this group
      const totalColumns = columns.length;
      group.forEach(event => {
        event.totalColumns = totalColumns;
      });
    });

    return sorted;
  }

  /**
   * Parse time string to minutes since midnight
   * @param {string} timeStr - Time in "HH:MM" format
   * @returns {number} Minutes since midnight
   */
  function timeToMinutes(timeStr) {
    if (!timeStr) return 9 * 60; // Default to 9 AM for all-day events
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + (minutes || 0);
  }

  /**
   * Get event end time based on outline duration or custom duration
   * @param {Object} event - Calendar event
   * @returns {number} End time in minutes since midnight
   */
  function getEventEndMinutes(event) {
    const startMinutes = timeToMinutes(event.time);
    return Math.min(startMinutes + getEventDurationMinutes(event), 24 * 60);
  }

  // Get calendar events from global state
  function getCalendarEvents() {
    const bridge = getAppBridge();
    if (bridge?.getCalendarEvents) {
      return bridge.getCalendarEvents() || [];
    }
    return window.calendarEvents || [];
  }

  // Save calendar events to global state
  function saveCalendarEvents(events) {
    const bridge = getAppBridge();
    if (bridge?.setCalendarEvents) {
      bridge.setCalendarEvents(Array.isArray(events) ? events : []);
      return;
    }
    window.calendarEvents = events;
    try {
      localStorage.setItem('calendar_events_v1', JSON.stringify(events));
      if (window.markDirty) window.markDirty();
    } catch (e) {
      console.error('Failed to save calendar events:', e);
    }
  }

  // Get saved outlines from global state
  function getSavedOutlines() {
    const bridge = getAppBridge();
    if (bridge?.getSavedOutlines) {
      return bridge.getSavedOutlines() || [];
    }
    if (window.savedOutlines && Array.isArray(window.savedOutlines)) {
      return window.savedOutlines;
    }
    try {
      const stored = localStorage.getItem('saved_outlines_v1');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load outlines:', e);
    }
    return [];
  }

  // Get outline by ID
  function getOutlineById(id) {
    return getSavedOutlines().find((outline) => outline.id === id);
  }

  // Format date helpers
  function formatDate(dateStr) {
    return formatShortDate(parseDateValue(dateStr));
  }

  function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  function formatRecurrenceSummary(recurrence, startDateStr) {
    if (!recurrence) return '';
    const normalized = normalizeRecurrence(recurrence, startDateStr || formatDateStr(new Date()));
    if (normalized.unit === 'weeks' && normalized.weekdays.length) {
      const labels = normalized.weekdays.map((index) => WEEKDAY_LABELS[index]).join(', ');
      return `Repeats ${labels}`;
    }
    if (normalized.unit === 'days') {
      return normalized.interval === 1 ? 'Repeats daily' : `Repeats every ${normalized.interval} days`;
    }
    if (normalized.unit === 'months') {
      return normalized.interval === 1 ? 'Repeats monthly' : `Repeats every ${normalized.interval} months`;
    }
    if (normalized.unit === 'years') {
      return normalized.interval === 1 ? 'Repeats yearly' : `Repeats every ${normalized.interval} years`;
    }
    return '';
  }

  function getEventDurationMinutes(event) {
    if (event?.customDuration) return Math.max(15, Number(event.customDuration) || 0);
    if (event?.time && event?.endTime) {
      let diff = timeToMinutes(event.endTime) - timeToMinutes(event.time);
      if (diff <= 0) diff += 24 * 60;
      return Math.max(15, diff);
    }
    const outline = getOutlineById(event?.outlineId);
    return outline ? Math.max(15, getTotalDuration(outline.sections)) : 60;
  }

  function getEventStartDateTime(event) {
    const start = parseDateValue(event.date);
    if (event.time) {
      const [hours, minutes] = event.time.split(':').map(Number);
      start.setHours(hours || 0, minutes || 0, 0, 0);
    }
    return start;
  }

  function getEventEndDateTime(event) {
    if (event.endDate && isAllDayEvent(event)) {
      return endOfDay(parseDateValue(event.endDate));
    }

    const start = getEventStartDateTime(event);
    if (event.endTime) {
      const end = parseDateValue(event.endDate || event.date);
      const [hours, minutes] = event.endTime.split(':').map(Number);
      end.setHours(hours || 0, minutes || 0, 0, 0);
      if (!event.endDate && end < start) {
        end.setDate(end.getDate() + 1);
      }
      return end;
    }

    return new Date(start.getTime() + (getEventDurationMinutes(event) * 60000));
  }

  function compareEventsChronologically(a, b) {
    const startDiff = getEventStartDateTime(a).getTime() - getEventStartDateTime(b).getTime();
    if (startDiff !== 0) return startDiff;
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return (a.title || '').localeCompare(b.title || '');
  }

  function sortEventsChronologically(events) {
    return [...events].sort(compareEventsChronologically);
  }

  function getEventKey(event) {
    return `${event.id}::${event.date}::${event.time || 'all-day'}`;
  }

  // Get events for a specific date (filters by visibility and includes multi-day + recurrence)
  function getEventsForDate(dateStr) {
    const target = parseDateValue(dateStr);
    return sortEventsChronologically(getEventsInRange(startOfDay(target), endOfDay(target)));
  }

  // Get timed events only (exclude all-day and multi-day)
  function getTimedEventsForDate(dateStr) {
    return getEventsForDate(dateStr).filter((event) => !isAllDayEvent(event));
  }

  // Get all-day and multi-day events for a date
  function getAllDayEventsForDate(dateStr) {
    return getEventsForDate(dateStr).filter((event) => isAllDayEvent(event));
  }

  // Calculate total duration from sections
  function getTotalDuration(sections) {
    if (!sections || !Array.isArray(sections)) return 0;
    return sections.reduce((sum, section) => sum + (Number(section.minutes) || 0), 0);
  }

  function getAgendaSnapshot(referenceDate = new Date()) {
    const todayDate = startOfDay(referenceDate);
    const todayStr = formatDateStr(todayDate);
    const todayEvents = getEventsForDate(todayStr);
    const upcomingEvents = sortEventsChronologically(
      getEventsInRange(startOfDay(referenceDate), endOfDay(addDays(referenceDate, 6)))
    ).filter((event) => getEventEndDateTime(event).getTime() >= referenceDate.getTime());

    return {
      todayDate,
      todayStr,
      todayEvents,
      upcomingEvents,
      nextEvent: upcomingEvents[0] || null,
      nextEventKey: upcomingEvents[0] ? getEventKey(upcomingEvents[0]) : ''
    };
  }

  function buildScheduleSubtitle(referenceDate, count, mode = 'today') {
    const label = formatLongDate(startOfDay(referenceDate));
    if (mode === 'upcoming') {
      return count
        ? `${label} and the next few days • ${count} scheduled block${count === 1 ? '' : 's'}`
        : `${label} • nothing scheduled in the next few days`;
    }
    return count
      ? `${label} • ${count} scheduled block${count === 1 ? '' : 's'}`
      : `${label} • no outlines scheduled yet`;
  }

  function getTodayEventStatus(event, referenceDate, nextEventKey) {
    if (isAllDayEvent(event)) return 'All day';
    const eventKey = getEventKey(event);
    const start = getEventStartDateTime(event);
    const end = getEventEndDateTime(event);
    if (referenceDate >= start && referenceDate < end) return 'Now';
    if (eventKey === nextEventKey && start > referenceDate) return 'Up next';
    return '';
  }

  function renderScheduleItem(event, { referenceDate = new Date(), showDate = false, nextEventKey = '' } = {}) {
    const cal = getCalendarById(event.calendarId || 'cal_default');
    const duration = getEventDurationMinutes(event);
    const status = getTodayEventStatus(event, referenceDate, nextEventKey);
    const metaParts = [`${duration} min`];
    if (showDate) metaParts.unshift(formatShortDate(parseDateValue(event.date)));
    if (event.notes) metaParts.push(event.notes);
    if (event.recurrence && !showDate) metaParts.push(formatRecurrenceSummary(event.recurrence, event.date));

    return `
      <div class="schedule-item schedule-item-rich" data-event-id="${event.id}">
        <div class="schedule-color-pill" style="background:${cal?.color || event.color || '#0ea5e9'}"></div>
        <div class="schedule-time">
          <span>${event.time ? formatTime(event.time) : 'All day'}</span>
          ${showDate ? `<small>${formatShortDate(parseDateValue(event.date))}</small>` : ''}
        </div>
        <div class="schedule-content">
          <div class="schedule-title-row">
            <div class="schedule-title">${event.title || 'Untitled'}</div>
            ${status ? `<span class="schedule-status-badge">${status}</span>` : ''}
          </div>
          <div class="schedule-meta">${metaParts.join(' • ')}</div>
        </div>
        <div class="schedule-actions">
          <button class="sf-btn sf-btn-primary sf-btn-compact schedule-start-btn" onclick="window.startEventSession('${event.id}')">Start</button>
        </div>
      </div>
    `;
  }

  function renderScheduleEmptyState(copy = 'Schedule an outline to turn today into a focused session plan.') {
    return `
      <div class="schedule-empty-state">
        <div class="schedule-empty-title">Nothing scheduled yet</div>
        <div class="schedule-empty-copy">${copy}</div>
        <button class="sf-btn sf-btn-secondary sf-btn-compact" type="button" data-open-quick-schedule="1">Schedule outline</button>
      </div>
    `;
  }

  function renderScheduleSection({
    cardSelector,
    listSelector,
    subtitleSelector,
    events,
    referenceDate = new Date(),
    showDate = false,
    emptyCopy = 'Schedule an outline to turn today into a focused session plan.',
    mode = 'today'
  }) {
    const card = $(cardSelector);
    const list = $(listSelector);
    const subtitle = subtitleSelector ? $(subtitleSelector) : null;
    if (!card || !list) return;

    card.style.display = 'block';
    if (subtitle) {
      subtitle.textContent = buildScheduleSubtitle(referenceDate, events.length, mode);
    }

    if (!events.length) {
      list.innerHTML = renderScheduleEmptyState(emptyCopy);
      return;
    }

    const snapshot = getAgendaSnapshot(referenceDate);
    list.innerHTML = events.map((event) => renderScheduleItem(event, {
      referenceDate,
      showDate,
      nextEventKey: snapshot.nextEventKey
    })).join('');
  }

  function renderTodaySchedule() {
    const snapshot = getAgendaSnapshot();
    renderScheduleSection({
      cardSelector: '#todayScheduleCard',
      listSelector: '#todayScheduleList',
      subtitleSelector: '#todayScheduleSubtitle',
      events: snapshot.todayEvents,
      referenceDate: snapshot.todayDate,
      emptyCopy: 'Pick an outline and give it a slot for today.',
      mode: 'today'
    });
  }

  function renderOverviewSchedule() {
    const snapshot = getAgendaSnapshot();
    renderScheduleSection({
      cardSelector: '#overviewTodaySchedule',
      listSelector: '#overviewScheduleList',
      subtitleSelector: '#overviewScheduleSubtitle',
      events: snapshot.todayEvents,
      referenceDate: snapshot.todayDate,
      emptyCopy: 'Your overview gets much better once today has a clear plan.',
      mode: 'today'
    });
  }

  function renderSessionSchedule() {
    const snapshot = getAgendaSnapshot();
    renderScheduleSection({
      cardSelector: '#sessionTodaySchedule',
      listSelector: '#sessionScheduleList',
      subtitleSelector: '#sessionScheduleSubtitle',
      events: snapshot.todayEvents,
      referenceDate: snapshot.todayDate,
      emptyCopy: 'Schedule an outline so the session page can guide today’s work block.',
      mode: 'today'
    });
  }

  function renderSavedSchedule() {
    const snapshot = getAgendaSnapshot();
    renderScheduleSection({
      cardSelector: '#savedSchedulePanel',
      listSelector: '#savedScheduleList',
      subtitleSelector: '#savedScheduleSubtitle',
      events: snapshot.upcomingEvents.slice(0, 6),
      referenceDate: snapshot.todayDate,
      showDate: true,
      emptyCopy: 'Schedule a saved outline here and it will show up across the app.',
      mode: 'upcoming'
    });
  }

  function renderTopbarScheduleSummary() {
    const button = $('#topbarScheduleSummary');
    const text = $('#topbarScheduleText');
    if (!button || !text) return;

    const snapshot = getAgendaSnapshot();
    button.style.display = 'inline-flex';

    if (!snapshot.todayEvents.length && !snapshot.nextEvent) {
      text.textContent = `${formatShortDate(snapshot.todayDate)} • Free`;
      return;
    }

    if (snapshot.todayEvents.length) {
      const nextLabel = snapshot.nextEvent
        ? ` • Next ${snapshot.nextEvent.time ? formatTime(snapshot.nextEvent.time) : 'all day'}`
        : '';
      text.textContent = `${snapshot.todayEvents.length} today${nextLabel}`;
      return;
    }

    text.textContent = `Next ${formatShortDate(parseDateValue(snapshot.nextEvent.date))} • ${snapshot.nextEvent.time ? formatTime(snapshot.nextEvent.time) : 'All day'}`;
  }

  function renderScheduleSurfaces() {
    renderTopbarScheduleSummary();
    renderOverviewSchedule();
    renderSessionSchedule();
    renderSavedSchedule();
    renderTodaySchedule();
  }

  // Render calendar grid
  function renderMonthView() {
    const grid = $('#calendarGrid');
    if (!grid) return;

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const prevLastDay = new Date(currentYear, currentMonth, 0);

    const firstDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const daysInPrevMonth = prevLastDay.getDate();

    let html = '<div class="calendar-header">';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
      html += `<div class="cal-day-name">${day}</div>`;
    });
    html += '</div>';

    // Previous month days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      html += `<div class="cal-day other-month"><div class="cal-day-number">${day}</div></div>`;
    }

    // Current month days
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const events = getEventsForDate(dateStr);

      let dayClass = 'cal-day';
      if (isToday) dayClass += ' today';

      html += `<div class="${dayClass}" data-date="${dateStr}">`;
      html += `<div class="cal-day-number">${day}</div>`;

      if (events.length > 0) {
        html += '<div class="cal-events">';
        const visibleEvents = events.slice(0, 2);
        visibleEvents.forEach(event => {
          const time = event.time ? formatTime(event.time) + ' ' : '';
          const duration = getEventDurationMinutes(event);
          const durationStr = duration > 0 ? `(${duration}m)` : '';
          html += `<div class="cal-event-label" data-event-id="${event.id}">${time}${event.title || 'Untitled'} ${durationStr}</div>`;
        });
        if (events.length > 2) {
          html += `<div class="cal-event-count">+${events.length - 2}</div>`;
        }
        html += '</div>';
      }

      html += '</div>';
    }

    // Next month days
    const totalCells = firstDayOfWeek + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
      html += `<div class="cal-day other-month"><div class="cal-day-number">${day}</div></div>`;
    }

    grid.innerHTML = html;

    // Update month/year display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthYearEl = $('#calMonthYear');
    if (monthYearEl) {
      monthYearEl.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    }

    // Update today's schedule
    renderTodaySchedule();

    // Setup drag and drop
    setupDragAndDrop();
  }

  // Render today's schedule summary
  function renderTodaySchedule() {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const events = getEventsForDate(todayStr);

    const card = $('#todayScheduleCard');
    const list = $('#todayScheduleList');

    if (!card || !list) return;

    if (events.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';

    // Sort events by time
    events.sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    let html = '';
    events.forEach(event => {
      const outline = getOutlineById(event.outlineId);
      const duration = outline ? getTotalDuration(outline.sections) : 0;

      html += `<div class="schedule-item" data-event-id="${event.id}">`;
      html += `<div class="schedule-time">${event.time ? formatTime(event.time) : 'All day'}</div>`;
      html += '<div class="schedule-content">';
      html += `<div class="schedule-title">${event.title || 'Untitled'}</div>`;
      html += `<div class="schedule-meta">${duration} min`;
      if (event.notes) html += ` • ${event.notes}`;
      html += '</div></div>';
      html += '<div class="schedule-actions">';
      html += `<button class="sf-btn sf-btn-primary sf-btn-compact schedule-start-btn" onclick="window.startEventSession('${event.id}')">Start</button>`;
      html += '</div></div>';
    });

    list.innerHTML = html;

    // Also update overview widget
    renderOverviewSchedule(events, todayStr);
  }

  // Render today's schedule on Overview tab
  function renderOverviewSchedule(events, todayStr) {
    const card = $('#overviewTodaySchedule');
    const list = $('#overviewScheduleList');

    if (!card || !list) return;

    // If not provided, calculate today's events
    if (!events) {
      const today = new Date();
      todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      events = getEventsForDate(todayStr);
    }

    if (events.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';

    // Sort events by time
    events.sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    let html = '';
    events.forEach(event => {
      const outline = getOutlineById(event.outlineId);
      const duration = outline ? getTotalDuration(outline.sections) : 0;

      html += `<div class="schedule-item" data-event-id="${event.id}">`;
      html += `<div class="schedule-time">${event.time ? formatTime(event.time) : 'All day'}</div>`;
      html += '<div class="schedule-content">';
      html += `<div class="schedule-title">${event.title || 'Untitled'}</div>`;
      html += `<div class="schedule-meta">${duration} min`;
      if (event.notes) html += ` • ${event.notes}`;
      html += '</div></div>';
      html += '<div class="schedule-actions">';
      html += `<button class="sf-btn sf-btn-primary sf-btn-compact schedule-start-btn" onclick="window.startEventSession('${event.id}')">Start</button>`;
      html += '</div></div>';
    });

    list.innerHTML = html;
  }

  // Render today's schedule on Session page
  function renderSessionSchedule() {
    const card = $('#sessionTodaySchedule');
    const list = $('#sessionScheduleList');

    if (!card || !list) return;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const events = getEventsForDate(todayStr);

    if (events.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';

    // Sort events by time
    events.sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    let html = '';
    events.forEach(event => {
      const outline = getOutlineById(event.outlineId);
      const duration = outline ? getTotalDuration(outline.sections) : 0;

      html += `<div class="schedule-item" data-event-id="${event.id}">`;
      html += `<div class="schedule-time">${event.time ? formatTime(event.time) : 'All day'}</div>`;
      html += '<div class="schedule-content">';
      html += `<div class="schedule-title">${event.title || 'Untitled'}</div>`;
      html += `<div class="schedule-meta">${duration} min`;
      if (event.notes) html += ` • ${event.notes}`;
      html += '</div></div>';
      html += '<div class="schedule-actions">';
      html += `<button class="sf-btn sf-btn-primary sf-btn-compact schedule-start-btn" onclick="window.startEventSession('${event.id}')">Start</button>`;
      html += '</div></div>';
    });

    list.innerHTML = html;
  }

  // Open event modal
  function openEventModal(eventId = null, date = null, preselectedOutlineId = null) {
    const modal = $('#calendarEventModal');
    const select = $('#eventOutlineSelect');
    const dateInput = $('#eventDateInput');
    const endDateInput = $('#eventEndDateInput');
    const timeInput = $('#eventTimeInput');
    const endTimeInput = $('#eventEndTimeInput');
    const allDayInput = $('#eventAllDayInput');
    const notesInput = $('#eventNotesInput');
    const recurrenceInput = $('#eventRecurrenceInput');
    const calendarSelect = $('#eventCalendarSelect');
    const customRecurrence = $('#eventCustomRecurrence');
    const timeRow = $('#eventTimeRow');
    const preview = $('#eventPreview');
    const deleteBtn = $('#eventDeleteBtn');
    const saveBtn = $('#eventSaveBtn');
    const titleEl = $('#eventModalTitle');

    if (!modal || !select) return;

    selectedEvent = eventId;

    // Populate outline selector
    const outlines = getSavedOutlines();
    let optionsHtml = '<option value="">Choose an outline...</option>';
    outlines.forEach(outline => {
      optionsHtml += `<option value="${outline.id}">${outline.title || 'Untitled'}</option>`;
    });
    select.innerHTML = optionsHtml;

    // Populate calendar selector
    populateCalendarSelect();

    // Setup all-day toggle
    if (allDayInput && timeRow) {
      allDayInput.addEventListener('change', () => {
        timeRow.style.display = allDayInput.checked ? 'none' : 'grid';
      });
    }

    // Setup recurrence toggle
    if (recurrenceInput && customRecurrence) {
      recurrenceInput.addEventListener('change', () => {
        customRecurrence.style.display = recurrenceInput.value === 'custom' ? 'block' : 'none';
      });
    }

    // Setup recurrence end type toggle
    const recurrenceEnd = $('#eventRecurrenceEnd');
    const recurrenceEndDateWrap = $('#eventRecurrenceEndDateWrap');
    const recurrenceCountWrap = $('#eventRecurrenceCountWrap');
    if (recurrenceEnd) {
      recurrenceEnd.addEventListener('change', () => {
        if (recurrenceEndDateWrap) recurrenceEndDateWrap.style.display = recurrenceEnd.value === 'date' ? 'block' : 'none';
        if (recurrenceCountWrap) recurrenceCountWrap.style.display = recurrenceEnd.value === 'count' ? 'block' : 'none';
      });
    }

    console.log('Loaded outlines for calendar:', outlines.length);

    if (eventId) {
      // Edit mode
      const event = getCalendarEvents().find(e => e.id === eventId);
      if (event) {
        titleEl.textContent = 'Edit Scheduled Outline';
        select.value = event.outlineId;
        dateInput.value = event.date;
        if (endDateInput) endDateInput.value = event.endDate || '';
        timeInput.value = event.time || '';
        if (endTimeInput) endTimeInput.value = event.endTime || '';
        if (allDayInput) allDayInput.checked = event.allDay || false;
        notesInput.value = event.notes || '';
        if (calendarSelect) calendarSelect.value = event.calendarId || 'cal_default';

        // Handle recurrence
        if (recurrenceInput && event.recurrence) {
          if (event.recurrence.type) {
            recurrenceInput.value = event.recurrence.type;
          } else {
            recurrenceInput.value = 'custom';
            if (customRecurrence) customRecurrence.style.display = 'block';
          }
        } else if (recurrenceInput) {
          recurrenceInput.value = '';
        }

        // Toggle time row based on all-day
        if (timeRow) timeRow.style.display = event.allDay ? 'none' : 'grid';

        deleteBtn.style.display = 'block';
        updateEventPreview();
      }
    } else {
      // Create mode
      titleEl.textContent = 'Schedule Outline';
      select.value = preselectedOutlineId || '';
      dateInput.value = date || '';
      if (endDateInput) endDateInput.value = '';
      timeInput.value = '';
      if (endTimeInput) endTimeInput.value = '';
      if (allDayInput) allDayInput.checked = false;
      notesInput.value = '';
      if (recurrenceInput) recurrenceInput.value = '';
      if (calendarSelect) calendarSelect.value = 'cal_default';
      if (customRecurrence) customRecurrence.style.display = 'none';
      if (timeRow) timeRow.style.display = 'grid';

      deleteBtn.style.display = 'none';
      if (preselectedOutlineId) {
        updateEventPreview();
      } else {
        preview.style.display = 'none';
      }
    }

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  // Update event preview
  function updateEventPreview() {
    const select = $('#eventOutlineSelect');
    const preview = $('#eventPreview');
    const previewContent = $('#eventPreviewContent');

    if (!select || !preview || !previewContent) return;

    const outlineId = select.value;
    if (!outlineId) {
      preview.style.display = 'none';
      return;
    }

    const outline = getOutlineById(outlineId);
    if (!outline) {
      preview.style.display = 'none';
      return;
    }

    const duration = getTotalDuration(outline.sections);
    const sectionCount = outline.sections ? outline.sections.length : 0;

    previewContent.innerHTML = `
      <strong>${outline.title || 'Untitled'}</strong><br>
      ${sectionCount} section${sectionCount !== 1 ? 's' : ''} • ${duration} minutes total
    `;

    preview.style.display = 'block';
  }

  // Save event
  function saveEvent() {
    const select = $('#eventOutlineSelect');
    const dateInput = $('#eventDateInput');
    const endDateInput = $('#eventEndDateInput');
    const timeInput = $('#eventTimeInput');
    const endTimeInput = $('#eventEndTimeInput');
    const allDayInput = $('#eventAllDayInput');
    const notesInput = $('#eventNotesInput');
    const recurrenceInput = $('#eventRecurrenceInput');
    const calendarSelect = $('#eventCalendarSelect');

    if (!select || !dateInput) return;

    const outlineId = select.value;
    const date = dateInput.value;

    if (!outlineId || !date) {
      alert('Please select an outline and date');
      return;
    }

    const outline = getOutlineById(outlineId);
    if (!outline) {
      alert('Outline not found');
      return;
    }

    // Build recurrence object
    let recurrence = null;
    if (recurrenceInput && recurrenceInput.value) {
      if (recurrenceInput.value === 'custom') {
        const interval = parseInt($('#eventRecurrenceInterval')?.value) || 1;
        const unit = $('#eventRecurrenceUnit')?.value || 'days';
        const endType = $('#eventRecurrenceEnd')?.value || 'never';

        recurrence = { interval, unit };

        if (endType === 'date') {
          recurrence.endDate = $('#eventRecurrenceEndDate')?.value || null;
        } else if (endType === 'count') {
          recurrence.count = parseInt($('#eventRecurrenceCount')?.value) || 10;
        }
      } else {
        recurrence = { type: recurrenceInput.value };
      }
    }

    // Get calendar color for the event
    const calId = calendarSelect?.value || 'cal_default';
    const cal = getCalendarById(calId);

    const events = getCalendarEvents();

    const eventData = {
      outlineId,
      date,
      endDate: endDateInput?.value || null,
      time: allDayInput?.checked ? null : (timeInput.value || null),
      endTime: allDayInput?.checked ? null : (endTimeInput?.value || null),
      allDay: allDayInput?.checked || false,
      notes: notesInput.value || '',
      title: outline.title || 'Untitled',
      calendarId: calId,
      color: cal?.color || '#0ea5e9',
      recurrence
    };

    if (selectedEvent) {
      // Update existing event
      const index = events.findIndex(e => e.id === selectedEvent);
      if (index !== -1) {
        events[index] = {
          ...events[index],
          ...eventData
        };
      }
    } else {
      // Create new event
      const newEvent = {
        id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        ...eventData
      };
      events.push(newEvent);
    }

    saveCalendarEvents(events);
    closeEventModal();
    renderCalendar();
  }

  // Delete event
  function deleteEvent() {
    if (!selectedEvent) return;

    if (!confirm('Delete this scheduled event?')) return;

    const events = getCalendarEvents();
    const filtered = events.filter(e => e.id !== selectedEvent);
    saveCalendarEvents(filtered);
    closeEventModal();
    renderCalendar();
  }

  // Close event modal
  function closeEventModal() {
    const modal = $('#calendarEventModal');
    if (!modal) return;

    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    selectedEvent = null;
  }

  // Start session from event
  function startEventSession(eventId) {
    const event = getCalendarEvents().find(e => e.id === eventId);
    if (!event) return;

    const outline = getOutlineById(event.outlineId);
    if (!outline) {
      alert('Outline not found');
      return;
    }

    // Load the outline into current session
    if (window.currentSession) {
      window.currentSession = outline.sections || [];
      try {
        localStorage.setItem('current_session_v1', JSON.stringify(window.currentSession));
        if (window.renderAll) window.renderAll();
        if (window.markDirty) window.markDirty();
      } catch(e) {
        console.error('Failed to load session:', e);
      }
    }

    // Switch to Session tab
    if (window.showTab) {
      window.showTab('homeTab');
    }
  }

  function renderTodaySchedule() {
    const snapshot = getAgendaSnapshot();
    renderScheduleSection({
      cardSelector: '#todayScheduleCard',
      listSelector: '#todayScheduleList',
      subtitleSelector: '#todayScheduleSubtitle',
      events: snapshot.todayEvents,
      referenceDate: snapshot.todayDate,
      emptyCopy: 'Pick an outline and give it a slot for today.',
      mode: 'today'
    });
  }

  function renderOverviewSchedule() {
    const snapshot = getAgendaSnapshot();
    renderScheduleSection({
      cardSelector: '#overviewTodaySchedule',
      listSelector: '#overviewScheduleList',
      subtitleSelector: '#overviewScheduleSubtitle',
      events: snapshot.todayEvents,
      referenceDate: snapshot.todayDate,
      emptyCopy: 'Your overview gets much better once today has a clear plan.',
      mode: 'today'
    });
  }

  function renderSessionSchedule() {
    const snapshot = getAgendaSnapshot();
    renderScheduleSection({
      cardSelector: '#sessionTodaySchedule',
      listSelector: '#sessionScheduleList',
      subtitleSelector: '#sessionScheduleSubtitle',
      events: snapshot.todayEvents,
      referenceDate: snapshot.todayDate,
      emptyCopy: "Schedule an outline so the session page can guide today's work block.",
      mode: 'today'
    });
  }

  function getModalElements() {
    return {
      modal: $('#calendarEventModal'),
      select: $('#eventOutlineSelect'),
      dateInput: $('#eventDateInput'),
      endDateInput: $('#eventEndDateInput'),
      timeInput: $('#eventTimeInput'),
      endTimeInput: $('#eventEndTimeInput'),
      allDayInput: $('#eventAllDayInput'),
      notesInput: $('#eventNotesInput'),
      recurrenceInput: $('#eventRecurrenceInput'),
      recurrenceUnit: $('#eventRecurrenceUnit'),
      recurrenceEnd: $('#eventRecurrenceEnd'),
      recurrenceEndDate: $('#eventRecurrenceEndDate'),
      recurrenceCount: $('#eventRecurrenceCount'),
      calendarSelect: $('#eventCalendarSelect'),
      customRecurrence: $('#eventCustomRecurrence'),
      weekdayWrap: $('#eventWeekdayWrap'),
      timeRow: $('#eventTimeRow'),
      preview: $('#eventPreview'),
      previewContent: $('#eventPreviewContent'),
      deleteBtn: $('#eventDeleteBtn'),
      saveBtn: $('#eventSaveBtn'),
      titleEl: $('#eventModalTitle'),
      recurrenceEndDateWrap: $('#eventRecurrenceEndDateWrap'),
      recurrenceCountWrap: $('#eventRecurrenceCountWrap')
    };
  }

  function getSelectedWeekdays() {
    return normalizeWeekdays(
      $$('#eventWeekdayWrap [data-weekday].is-selected').map((button) => Number(button.dataset.weekday))
    );
  }

  function setSelectedWeekdays(days, { manual = false } = {}) {
    const normalized = normalizeWeekdays(days);
    $$('#eventWeekdayWrap [data-weekday]').forEach((button) => {
      button.classList.toggle('is-selected', normalized.includes(Number(button.dataset.weekday)));
    });
    if (manual) modalState.manualWeekdays = true;
  }

  function updateQuickDateState() {
    $$('#eventQuickDateRow [data-quick-date]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.quickDate === modalState.activeQuickDate);
    });
  }

  function resolveQuickDate(kind) {
    const today = startOfDay(new Date());
    switch (kind) {
      case 'today':
        return today;
      case 'tomorrow':
        return addDays(today, 1);
      case 'nextMonday':
        return nextNamedDay(1, today);
      case 'nextWeek':
        return addDays(today, 7);
      default:
        return today;
    }
  }

  function getSuggestedStartTime(dateStr) {
    const defaults = loadScheduleDefaults();
    if (defaults.startTime) return defaults.startTime;
    const todayStr = formatDateStr(new Date());
    if (dateStr !== todayStr) return '09:00';
    const rounded = roundUpToHalfHour(new Date());
    return rounded.getHours() >= 22 ? '09:00' : timeStringFromDate(rounded);
  }

  function getSuggestedScheduleDefaults(preselectedDate, outlineId) {
    const defaults = loadScheduleDefaults();
    let targetDate = preselectedDate ? parseDateValue(preselectedDate) : startOfDay(new Date());
    if (!preselectedDate) {
      const rounded = roundUpToHalfHour(new Date());
      if (rounded.getHours() >= 22) targetDate = addDays(targetDate, 1);
    }

    const outline = outlineId ? getOutlineById(outlineId) : null;
    const duration = outline ? Math.max(15, getTotalDuration(outline.sections)) : 60;
    const dateStr = formatDateStr(targetDate);
    const startTime = defaults.startTime || getSuggestedStartTime(dateStr);

    return {
      date: dateStr,
      time: startTime,
      endTime: addMinutesToTime(startTime, duration),
      calendarId: defaults.calendarId || 'cal_default'
    };
  }

  function syncRecurrenceUi() {
    const {
      dateInput,
      recurrenceInput,
      recurrenceUnit,
      recurrenceEnd,
      recurrenceEndDateWrap,
      recurrenceCountWrap,
      customRecurrence,
      weekdayWrap
    } = getModalElements();

    const isCustom = recurrenceInput?.value === 'custom';
    if (customRecurrence) customRecurrence.style.display = isCustom ? 'block' : 'none';

    const showWeekdays = recurrenceInput?.value === 'weekly' || (isCustom && recurrenceUnit?.value === 'weeks');
    if (weekdayWrap) {
      weekdayWrap.style.display = 'block';
      weekdayWrap.classList.toggle('is-inactive', !showWeekdays);
    }
    if (recurrenceEndDateWrap) recurrenceEndDateWrap.style.display = recurrenceEnd?.value === 'date' ? 'block' : 'none';
    if (recurrenceCountWrap) recurrenceCountWrap.style.display = recurrenceEnd?.value === 'count' ? 'block' : 'none';

    if (showWeekdays && !getSelectedWeekdays().length && dateInput?.value && !modalState.manualWeekdays) {
      setSelectedWeekdays([parseDateValue(dateInput.value).getDay()]);
    }
  }

  function applySuggestedTiming({ forceDate = false, forceTime = false } = {}) {
    const { select, dateInput, timeInput, endTimeInput, allDayInput, calendarSelect } = getModalElements();
    if (!dateInput || !timeInput || !endTimeInput) return;

    const suggested = getSuggestedScheduleDefaults(dateInput.value, select?.value || '');
    if (!dateInput.value || forceDate) dateInput.value = suggested.date;
    if (!allDayInput?.checked && (!timeInput.value || forceTime)) timeInput.value = suggested.time;

    const outline = select?.value ? getOutlineById(select.value) : null;
    const duration = outline ? Math.max(15, getTotalDuration(outline.sections)) : 60;
    const nextAutoEndTime = addMinutesToTime(timeInput.value || suggested.time, duration);
    const shouldUpdateEnd = !endTimeInput.value || !modalState.manualEndTime || endTimeInput.value === modalState.lastAutoEndTime;

    if (!allDayInput?.checked && shouldUpdateEnd) {
      endTimeInput.value = nextAutoEndTime;
      modalState.manualEndTime = false;
    }

    modalState.lastAutoEndTime = nextAutoEndTime;
    if (calendarSelect && !calendarSelect.value) calendarSelect.value = suggested.calendarId;
    updateQuickDateState();
  }

  function buildDraftRecurrence() {
    const {
      dateInput,
      recurrenceInput,
      recurrenceUnit,
      recurrenceEnd,
      recurrenceEndDate,
      recurrenceCount
    } = getModalElements();
    if (!recurrenceInput?.value) return null;

    const selectedWeekdays = getSelectedWeekdays();
    if (recurrenceInput.value === 'custom') {
      const interval = parseInt($('#eventRecurrenceInterval')?.value, 10) || 1;
      const unit = recurrenceUnit?.value || 'days';
      const nextRecurrence = { interval, unit };
      if (unit === 'weeks' && selectedWeekdays.length) nextRecurrence.weekdays = selectedWeekdays;
      if (recurrenceEnd?.value === 'date') nextRecurrence.endDate = recurrenceEndDate?.value || null;
      if (recurrenceEnd?.value === 'count') nextRecurrence.count = parseInt(recurrenceCount?.value, 10) || 10;
      return nextRecurrence;
    }

    const nextRecurrence = { type: recurrenceInput.value };
    if (recurrenceInput.value === 'weekly') {
      nextRecurrence.weekdays = selectedWeekdays.length
        ? selectedWeekdays
        : [parseDateValue(dateInput?.value || formatDateStr(new Date())).getDay()];
    }
    return nextRecurrence;
  }

  function updateEventPreview() {
    const {
      select,
      dateInput,
      timeInput,
      endTimeInput,
      allDayInput,
      preview,
      previewContent
    } = getModalElements();

    if (!select || !preview || !previewContent) return;
    const outline = getOutlineById(select.value);
    if (!outline) {
      preview.style.display = 'none';
      return;
    }

    const duration = Math.max(15, getTotalDuration(outline.sections));
    const sectionCount = Array.isArray(outline.sections) ? outline.sections.length : 0;
    const scheduleParts = [];
    if (dateInput?.value) scheduleParts.push(formatLongDate(parseDateValue(dateInput.value)));
    if (allDayInput?.checked) {
      scheduleParts.push('All day');
    } else if (timeInput?.value) {
      scheduleParts.push(`${formatTime(timeInput.value)}${endTimeInput?.value ? ` - ${formatTime(endTimeInput.value)}` : ''}`);
    }
    const draftRecurrence = buildDraftRecurrence();
    if (draftRecurrence) scheduleParts.push(formatRecurrenceSummary(draftRecurrence, dateInput?.value));

    previewContent.innerHTML = `
      <div><strong>${outline.title || 'Untitled'}</strong></div>
      <div>${sectionCount} section${sectionCount === 1 ? '' : 's'} • ${duration} minutes total</div>
      ${scheduleParts.length ? `<div>${scheduleParts.join(' • ')}</div>` : ''}
    `;

    preview.style.display = 'block';
  }

  function populateOutlineSelect(preselectedOutlineId = '') {
    const { select } = getModalElements();
    if (!select) return;
    const outlines = getSavedOutlines();
    let optionsHtml = '<option value="">Choose an outline...</option>';
    outlines.forEach((outline) => {
      optionsHtml += `<option value="${outline.id}">${outline.title || 'Untitled'}</option>`;
    });
    select.innerHTML = optionsHtml;
    if (preselectedOutlineId) select.value = preselectedOutlineId;
  }

  function openEventModal(eventId = null, date = null, preselectedOutlineId = null) {
    const {
      modal,
      select,
      dateInput,
      endDateInput,
      timeInput,
      endTimeInput,
      allDayInput,
      notesInput,
      recurrenceInput,
      recurrenceUnit,
      recurrenceEnd,
      recurrenceEndDate,
      recurrenceCount,
      calendarSelect,
      timeRow,
      deleteBtn,
      saveBtn,
      titleEl
    } = getModalElements();

    if (!modal || !select || !dateInput || !timeInput || !endTimeInput) return;

    selectedEvent = eventId;
    modalState.manualEndTime = false;
    modalState.manualWeekdays = false;
    modalState.lastAutoEndTime = '';
    modalState.activeQuickDate = '';

    populateOutlineSelect(preselectedOutlineId || '');
    populateCalendarSelect();

    if (eventId) {
      const event = getCalendarEvents().find((entry) => entry.id === eventId);
      if (!event) return;

      titleEl.textContent = 'Edit Scheduled Outline';
      saveBtn.textContent = 'Save changes';
      select.value = event.outlineId;
      dateInput.value = event.date;
      if (endDateInput) endDateInput.value = event.endDate || '';
      timeInput.value = event.time || '';
      endTimeInput.value = event.endTime || '';
      if (allDayInput) allDayInput.checked = !!event.allDay;
      if (notesInput) notesInput.value = event.notes || '';
      if (calendarSelect) calendarSelect.value = event.calendarId || 'cal_default';
      if (recurrenceInput) recurrenceInput.value = event.recurrence?.type || (event.recurrence ? 'custom' : '');
      if (recurrenceUnit) recurrenceUnit.value = event.recurrence?.unit || 'days';
      if (recurrenceEnd) recurrenceEnd.value = event.recurrence?.endDate ? 'date' : (event.recurrence?.count ? 'count' : 'never');
      if (recurrenceEndDate) recurrenceEndDate.value = event.recurrence?.endDate || '';
      if (recurrenceCount) recurrenceCount.value = event.recurrence?.count || 10;
      setSelectedWeekdays(event.recurrence?.weekdays || []);
      modalState.manualWeekdays = !!(event.recurrence?.weekdays && event.recurrence.weekdays.length);
      modalState.manualEndTime = !!(event.endTime || event.customDuration);
      deleteBtn.style.display = 'block';
    } else {
      const suggested = getSuggestedScheduleDefaults(date, preselectedOutlineId || '');
      titleEl.textContent = 'Schedule Outline';
      saveBtn.textContent = 'Schedule';
      select.value = preselectedOutlineId || '';
      dateInput.value = date || suggested.date;
      if (endDateInput) endDateInput.value = '';
      timeInput.value = suggested.time;
      endTimeInput.value = suggested.endTime;
      if (allDayInput) allDayInput.checked = false;
      if (notesInput) notesInput.value = '';
      if (recurrenceInput) recurrenceInput.value = '';
      if (recurrenceUnit) recurrenceUnit.value = 'days';
      if (recurrenceEnd) recurrenceEnd.value = 'never';
      if (recurrenceEndDate) recurrenceEndDate.value = '';
      if (recurrenceCount) recurrenceCount.value = 10;
      if (calendarSelect) calendarSelect.value = suggested.calendarId;
      setSelectedWeekdays([]);
      deleteBtn.style.display = 'none';
    }

    if (timeRow) timeRow.style.display = allDayInput?.checked ? 'none' : 'grid';
    syncRecurrenceUi();
    applySuggestedTiming();
    updateQuickDateState();
    updateEventPreview();

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function saveEvent() {
    const {
      select,
      dateInput,
      endDateInput,
      timeInput,
      endTimeInput,
      allDayInput,
      notesInput,
      calendarSelect
    } = getModalElements();

    if (!select || !dateInput || !timeInput || !endTimeInput) return;
    const outlineId = select.value;
    const date = dateInput.value;

    if (!outlineId || !date) {
      alert('Please select an outline and date');
      return;
    }

    const outline = getOutlineById(outlineId);
    if (!outline) {
      alert('Outline not found');
      return;
    }

    const recurrence = buildDraftRecurrence();
    const calId = calendarSelect?.value || 'cal_default';
    const cal = getCalendarById(calId);
    const events = [...getCalendarEvents()];
    const nextEndDate = endDateInput?.value && parseDateValue(endDateInput.value) >= parseDateValue(date)
      ? endDateInput.value
      : null;
    const resolvedStartTime = allDayInput?.checked ? null : (timeInput.value || getSuggestedStartTime(date));
    const resolvedEndTime = allDayInput?.checked
      ? null
      : (endTimeInput.value || addMinutesToTime(resolvedStartTime, Math.max(15, getTotalDuration(outline.sections))));
    const eventData = {
      outlineId,
      date,
      endDate: nextEndDate,
      time: resolvedStartTime,
      endTime: resolvedEndTime,
      allDay: !!allDayInput?.checked,
      notes: notesInput?.value || '',
      title: outline.title || 'Untitled',
      sourceOutlineTitle: outline.title || 'Untitled',
      calendarId: calId,
      color: cal?.color || '#0ea5e9',
      recurrence
    };

    if (selectedEvent) {
      const index = events.findIndex((entry) => entry.id === selectedEvent);
      if (index !== -1) {
        events[index] = { ...events[index], ...eventData };
      }
    } else {
      events.push({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        ...eventData
      });
    }

    saveScheduleDefaults({
      calendarId: calId,
      startTime: resolvedStartTime || '09:00'
    });
    saveCalendarEvents(events);
    closeEventModal();
    renderCalendar();
  }

  function startEventSession(eventId) {
    const event = getCalendarEvents().find((entry) => entry.id === eventId);
    if (!event) return;

    const bridge = getAppBridge();
    const loaded = bridge?.loadOutlineIntoCurrent
      ? bridge.loadOutlineIntoCurrent(event.outlineId)
      : false;

    if (!loaded) {
      const outline = getOutlineById(event.outlineId);
      if (!outline) {
        alert('Outline not found');
        return;
      }
      try {
        localStorage.setItem('current_session_v1', JSON.stringify(outline.sections || []));
        if (window.renderAll) window.renderAll();
      } catch (error) {
        console.error('Failed to load session:', error);
      }
    }

    if (bridge?.showTab) bridge.showTab('homeTab');
    else if (window.showTab) window.showTab('homeTab');
  }

  // ============================================
  // ADVANCED WEEK VIEW RENDERING
  // ============================================

  // Constants for week view layout
  const WEEK_START_HOUR = 6;  // 6 AM
  const WEEK_END_HOUR = 22;   // 10 PM
  const HOUR_HEIGHT = 60;     // 60px per hour

  /**
   * Render the enhanced week view with collision detection
   */
  function renderWeekView() {
    const container = $('#weekView');
    const grid = $('#weekGrid');
    if (!grid || !container) return;

    // Get the week containing the first day of current month
    const firstDay = new Date(currentYear, currentMonth, 1);
    const weekStart = new Date(firstDay);
    weekStart.setDate(firstDay.getDate() - firstDay.getDay()); // Start on Sunday

    // Build HTML structure
    let html = '';

    // Header row with days
    html += '<div class="week-time-label week-corner"></div>'; // Empty corner
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      const isToday = day.toDateString() === new Date().toDateString();
      const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      html += `<div class="week-day-header ${isToday ? 'today' : ''}" data-date="${dateStr}">
        <div class="week-day-name">${day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        <div class="week-day-number">${day.getDate()}</div>
      </div>`;
    }

    // Time grid rows
    for (let hour = WEEK_START_HOUR; hour <= WEEK_END_HOUR; hour++) {
      const timeLabel = `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
      html += `<div class="week-time-label">${timeLabel}</div>`;

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + dayOffset);
        const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        const timeStr = `${String(hour).padStart(2, '0')}:00`;
        const isToday = day.toDateString() === new Date().toDateString();

        html += `<div class="week-cell ${isToday ? 'today-column' : ''}" data-date="${dateStr}" data-time="${timeStr}" data-hour="${hour}"></div>`;
      }
    }

    grid.innerHTML = html;

    // Render all-day events banner
    renderAllDayEventsBanner(weekStart);

    // Render timed events with absolute positioning
    renderWeekEvents(weekStart);

    // Add current time indicator
    updateCurrentTimeIndicator();

    // Update month/year display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthYearEl = $('#calMonthYear');
    if (monthYearEl) {
      const endDay = new Date(weekStart);
      endDay.setDate(weekStart.getDate() + 6);
      monthYearEl.textContent = `Week of ${monthNames[weekStart.getMonth()]} ${weekStart.getDate()}, ${weekStart.getFullYear()}`;
    }

    // Auto-scroll to current time
    autoScrollToCurrentTime();

    setupDragAndDrop();
    setupEventInteractions();

    // Start the time indicator update interval
    startTimeIndicatorUpdates();
  }

  /**
   * Render events with proper positioning and collision handling
   */
  function renderWeekEvents(weekStart) {
    const grid = $('#weekGrid');
    if (!grid) return;

    // Get all day columns
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + dayOffset);
      const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;

      // Get events for this day and add timing info
      let dayEvents = getEventsForDate(dateStr).map(event => ({
        ...event,
        startMinutes: timeToMinutes(event.time),
        endMinutes: getEventEndMinutes(event)
      }));

      // Filter to events within visible range
      const viewStartMinutes = WEEK_START_HOUR * 60;
      const viewEndMinutes = (WEEK_END_HOUR + 1) * 60;
      dayEvents = dayEvents.filter(e =>
        e.startMinutes < viewEndMinutes && e.endMinutes > viewStartMinutes
      );

      // Calculate layout positions for overlapping events
      dayEvents = calculateEventLayout(dayEvents);

      // Find the first cell for this day to get column position
      const firstCell = grid.querySelector(`.week-cell[data-date="${dateStr}"]`);
      if (!firstCell) continue;

      // Create event elements
      dayEvents.forEach(event => {
        const eventEl = createWeekEventElement(event, dateStr);
        firstCell.appendChild(eventEl);
      });
    }
  }

  /**
   * Create a positioned event element for week view
   */
  function createWeekEventElement(event, dateStr) {
    const duration = getEventDurationMinutes(event);

    // Calculate positioning
    const viewStartMinutes = WEEK_START_HOUR * 60;
    const startOffset = Math.max(0, event.startMinutes - viewStartMinutes);
    const endOffset = Math.min((WEEK_END_HOUR + 1 - WEEK_START_HOUR) * 60, event.endMinutes - viewStartMinutes);
    const eventDuration = endOffset - startOffset;

    // Convert to pixels
    const top = (startOffset / 60) * HOUR_HEIGHT;
    const height = Math.max(20, (eventDuration / 60) * HOUR_HEIGHT - 2);

    // Calculate width and left position based on collision columns
    const column = event.column || 0;
    const totalColumns = event.totalColumns || 1;
    const widthPercent = (100 / totalColumns) - 1;
    const leftPercent = column * (100 / totalColumns);

    // Create element
    const el = document.createElement('div');
    el.className = 'week-event-block';
    el.dataset.eventId = event.id;
    el.dataset.date = dateStr;
    el.draggable = true;

    // Get calendar color if available (for multi-calendar system)
    const eventColor = event.color || 'var(--accent)';
    const eventColorLight = event.colorLight || 'var(--accent-100)';

    el.style.cssText = `
      position: absolute;
      top: ${top}px;
      left: ${leftPercent}%;
      width: ${widthPercent}%;
      height: ${height}px;
      background: ${eventColor};
      border-left: 3px solid ${eventColor};
      z-index: 10;
    `;

    // Content
    const timeStr = event.time ? formatTime(event.time) : 'All day';
    const durationStr = duration > 0 ? `${duration}m` : '';

    el.innerHTML = `
      <div class="week-event-title">${event.title || 'Untitled'}</div>
      <div class="week-event-time">${timeStr}${durationStr ? ' • ' + durationStr : ''}</div>
      <div class="week-event-resize-handle" data-resize="true"></div>
    `;

    return el;
  }

  /**
   * Update or create the current time indicator
   */
  function updateCurrentTimeIndicator() {
    const grid = $('#weekGrid');
    if (!grid || viewMode !== 'week') return;

    // Remove existing indicator
    const existing = grid.querySelector('.current-time-indicator');
    if (existing) existing.remove();

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const totalMinutes = currentHour * 60 + currentMinutes;

    // Check if current time is in visible range
    const viewStartMinutes = WEEK_START_HOUR * 60;
    const viewEndMinutes = (WEEK_END_HOUR + 1) * 60;

    if (totalMinutes < viewStartMinutes || totalMinutes > viewEndMinutes) {
      return; // Current time not in visible range
    }

    // Find today's column
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayCell = grid.querySelector(`.week-cell[data-date="${todayStr}"]`);

    if (!todayCell) return; // Today not visible in current week

    // Calculate position
    const offsetMinutes = totalMinutes - viewStartMinutes;
    const top = (offsetMinutes / 60) * HOUR_HEIGHT;

    // Create indicator
    const indicator = document.createElement('div');
    indicator.className = 'current-time-indicator';
    indicator.innerHTML = `
      <div class="current-time-dot"></div>
      <div class="current-time-line"></div>
    `;
    indicator.style.top = `${top}px`;

    todayCell.appendChild(indicator);
  }

  /**
   * Start interval to update time indicator every minute
   */
  function startTimeIndicatorUpdates() {
    if (currentTimeInterval) {
      clearInterval(currentTimeInterval);
    }

    if (viewMode === 'week') {
      currentTimeInterval = setInterval(() => {
        updateCurrentTimeIndicator();
      }, 60000); // Update every minute
    }
  }

  /**
   * Stop time indicator updates
   */
  function stopTimeIndicatorUpdates() {
    if (currentTimeInterval) {
      clearInterval(currentTimeInterval);
      currentTimeInterval = null;
    }
  }

  /**
   * Auto-scroll to current time on load
   */
  function autoScrollToCurrentTime() {
    const container = $('#weekView');
    if (!container || viewMode !== 'week') return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const totalMinutes = currentHour * 60 + currentMinutes;

    const viewStartMinutes = WEEK_START_HOUR * 60;
    const viewEndMinutes = (WEEK_END_HOUR + 1) * 60;

    if (totalMinutes < viewStartMinutes || totalMinutes > viewEndMinutes) {
      return; // Current time not in visible range
    }

    // Calculate scroll position (center current time in viewport)
    const offsetMinutes = totalMinutes - viewStartMinutes;
    const scrollTop = (offsetMinutes / 60) * HOUR_HEIGHT;
    const viewportHeight = container.clientHeight;
    const targetScroll = Math.max(0, scrollTop - viewportHeight / 2 + 100);

    // Smooth scroll
    container.scrollTo({
      top: targetScroll,
      behavior: 'smooth'
    });
  }

  /**
   * Setup event interactions (click, drag to resize, drag to move)
   */
  function setupEventInteractions() {
    // Click to edit
    document.querySelectorAll('.week-event-block').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.dataset.resize) return; // Ignore resize handle clicks
        e.stopPropagation();
        const eventId = el.dataset.eventId;
        if (eventId) {
          openEventModal(eventId);
        }
      });
    });

    // Drag to resize (bottom edge)
    setupDragToResize();

    // Drag to move (entire block)
    setupDragToMove();
  }

  // ============================================
  // DRAG TO RESIZE
  // ============================================

  let resizeState = null;

  function setupDragToResize() {
    document.querySelectorAll('.week-event-resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', startResize);
    });
  }

  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();

    const eventBlock = e.target.closest('.week-event-block');
    if (!eventBlock) return;

    const eventId = eventBlock.dataset.eventId;
    const event = getCalendarEvents().find(ev => ev.id === eventId);
    if (!event) return;

    const startHeight = eventBlock.offsetHeight;
    const startY = e.clientY;

    resizeState = {
      eventId,
      eventBlock,
      startHeight,
      startY,
      startMinutes: timeToMinutes(event.time),
      originalEndMinutes: getEventEndMinutes(event)
    };

    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', endResize);
    eventBlock.classList.add('resizing');
  }

  function doResize(e) {
    if (!resizeState) return;

    const deltaY = e.clientY - resizeState.startY;
    const newHeight = Math.max(20, resizeState.startHeight + deltaY);
    resizeState.eventBlock.style.height = `${newHeight}px`;
  }

  function endResize(e) {
    if (!resizeState) return;

    const deltaY = e.clientY - resizeState.startY;
    const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 60 / 15) * 15; // Snap to 15 min
    const newEndMinutes = Math.max(
      resizeState.startMinutes + 15, // Minimum 15 minutes
      resizeState.originalEndMinutes + deltaMinutes
    );

    // Update the event's linked outline duration (or store endTime)
    // For now, we'll store an explicit endTime on the event
    const events = getCalendarEvents();
    const event = events.find(ev => ev.id === resizeState.eventId);
    if (event) {
      const newDuration = newEndMinutes - resizeState.startMinutes;
      event.customDuration = newDuration; // Store custom duration in minutes
      saveCalendarEvents(events);
    }

    resizeState.eventBlock.classList.remove('resizing');
    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', endResize);
    resizeState = null;

    renderCalendar();
  }

  // ============================================
  // DRAG TO MOVE
  // ============================================

  let dragMoveState = null;

  function setupDragToMove() {
    document.querySelectorAll('.week-event-block').forEach(block => {
      block.addEventListener('mousedown', (e) => {
        // Ignore if clicking resize handle
        if (e.target.dataset.resize) return;
        // Ignore if not primary mouse button
        if (e.button !== 0) return;

        startDragMove(e, block);
      });
    });
  }

  function startDragMove(e, block) {
    const eventId = block.dataset.eventId;
    const event = getCalendarEvents().find(ev => ev.id === eventId);
    if (!event) return;

    const rect = block.getBoundingClientRect();
    const grid = $('#weekGrid');
    if (!grid) return;

    dragMoveState = {
      eventId,
      block,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      originalDate: event.date,
      originalTime: event.time
    };

    // Create ghost element for dragging
    const ghost = block.cloneNode(true);
    ghost.className = 'week-event-block dragging-ghost';
    ghost.style.position = 'fixed';
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '1000';
    ghost.style.opacity = '0.8';
    document.body.appendChild(ghost);
    dragMoveState.ghost = ghost;

    block.style.opacity = '0.3';

    document.addEventListener('mousemove', doDragMove);
    document.addEventListener('mouseup', endDragMove);
  }

  function doDragMove(e) {
    if (!dragMoveState || !dragMoveState.ghost) return;

    dragMoveState.ghost.style.left = `${e.clientX - dragMoveState.offsetX}px`;
    dragMoveState.ghost.style.top = `${e.clientY - dragMoveState.offsetY}px`;

    // Highlight potential drop target
    const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
    const cell = dropTarget?.closest('.week-cell');

    // Remove highlight from all cells
    document.querySelectorAll('.week-cell.drop-highlight').forEach(c => {
      c.classList.remove('drop-highlight');
    });

    if (cell) {
      cell.classList.add('drop-highlight');
    }
  }

  function endDragMove(e) {
    if (!dragMoveState) return;

    // Find drop target
    const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
    const cell = dropTarget?.closest('.week-cell');

    if (cell) {
      const newDate = cell.dataset.date;
      const cellHour = parseInt(cell.dataset.hour);

      // Calculate new time based on drop position
      const cellRect = cell.getBoundingClientRect();
      const offsetInCell = e.clientY - cellRect.top;
      const minuteOffset = Math.round((offsetInCell / HOUR_HEIGHT) * 60 / 15) * 15;
      const newHour = cellHour + Math.floor(minuteOffset / 60);
      const newMinute = minuteOffset % 60;
      const newTime = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;

      // Update event
      const events = getCalendarEvents();
      const event = events.find(ev => ev.id === dragMoveState.eventId);
      if (event) {
        event.date = newDate;
        event.time = newTime;
        saveCalendarEvents(events);
      }
    }

    // Cleanup
    if (dragMoveState.ghost) {
      dragMoveState.ghost.remove();
    }
    if (dragMoveState.block) {
      dragMoveState.block.style.opacity = '';
    }
    document.querySelectorAll('.week-cell.drop-highlight').forEach(c => {
      c.classList.remove('drop-highlight');
    });

    document.removeEventListener('mousemove', doDragMove);
    document.removeEventListener('mouseup', endDragMove);
    dragMoveState = null;

    renderCalendar();
  }

  // Navigate calendar
  function prevMonth() {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar();
  }

  function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar();
  }

  function goToToday() {
    const today = new Date();
    currentMonth = today.getMonth();
    currentYear = today.getFullYear();
    renderCalendar();
  }

  // Drag and drop for events
  let draggedEventId = null;

  function setupDragAndDrop() {
    // Event dragging
    document.querySelectorAll('.cal-event-label, .week-event').forEach(el => {
      el.setAttribute('draggable', 'true');

      el.addEventListener('dragstart', (e) => {
        draggedEventId = el.dataset.eventId;
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
        e.stopPropagation(); // Prevent parent handlers
      });

      el.addEventListener('dragend', (e) => {
        el.classList.remove('dragging');
        draggedEventId = null;
      });

      // Prevent click event immediately after drag
      el.addEventListener('click', (e) => {
        if (draggedEventId) {
          e.stopPropagation();
          e.preventDefault();
        }
      });
    });

    // Drop targets (calendar days and week cells)
    document.querySelectorAll('.cal-day, .week-cell').forEach(cell => {
      cell.addEventListener('dragover', (e) => {
        if (!draggedEventId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('drag-over');
      });

      cell.addEventListener('dragleave', (e) => {
        cell.classList.remove('drag-over');
      });

      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        cell.classList.remove('drag-over');

        if (!draggedEventId) return;

        const newDate = cell.dataset.date;
        const newTime = cell.dataset.time;

        if (!newDate) return;

        // Update event
        const events = getCalendarEvents();
        const event = events.find(e => e.id === draggedEventId);
        if (event) {
          event.date = newDate;
          if (newTime) {
            event.time = newTime;
          }
          saveCalendarEvents(events);
          renderCalendar();
        }
      });
    });
  }

  // Main render function
  function renderCalendar() {
    const monthBtn = $('#calViewMonth');
    const weekBtn = $('#calViewWeek');
    const calGrid = $('#calendarGrid');
    const weekViewEl = $('#weekView');

    if (viewMode === 'month') {
      renderMonthView();
      if (calGrid && calGrid.parentElement) {
        calGrid.parentElement.style.display = 'block';
      }
      if (weekViewEl) weekViewEl.style.display = 'none';

      if (monthBtn) {
        monthBtn.classList.add('sf-btn-primary');
        monthBtn.classList.remove('sf-btn-ghost');
      }
      if (weekBtn) {
        weekBtn.classList.remove('sf-btn-primary');
        weekBtn.classList.add('sf-btn-ghost');
      }
    } else {
      renderWeekView();
      if (calGrid && calGrid.parentElement) {
        calGrid.parentElement.style.display = 'none';
      }
      if (weekViewEl) weekViewEl.style.display = 'block';

      if (weekBtn) {
        weekBtn.classList.add('sf-btn-primary');
        weekBtn.classList.remove('sf-btn-ghost');
      }
      if (monthBtn) {
        monthBtn.classList.remove('sf-btn-primary');
        monthBtn.classList.add('sf-btn-ghost');
      }
    }
  }

  // Event listeners
  function setupEventListeners() {
    // Month navigation
    const prevBtn = $('#calPrevMonth');
    const nextBtn = $('#calNextMonth');
    const todayBtn = $('#calToday');

    if (prevBtn) prevBtn.addEventListener('click', prevMonth);
    if (nextBtn) nextBtn.addEventListener('click', nextMonth);
    if (todayBtn) todayBtn.addEventListener('click', goToToday);

    // View toggle
    const monthBtn = $('#calViewMonth');
    const weekBtn = $('#calViewWeek');

    if (monthBtn) monthBtn.addEventListener('click', () => {
      viewMode = 'month';
      renderCalendar();
    });

    if (weekBtn) weekBtn.addEventListener('click', () => {
      viewMode = 'week';
      renderCalendar();
    });

    // Calendar day clicks
    document.addEventListener('click', (e) => {
      const day = e.target.closest('.cal-day');
      if (day && !day.classList.contains('other-month')) {
        const date = day.dataset.date;
        if (date) {
          openEventModal(null, date);
        }
      }

      // Event label clicks
      const eventLabel = e.target.closest('.cal-event-label');
      if (eventLabel) {
        e.stopPropagation();
        const eventId = eventLabel.dataset.eventId;
        if (eventId) {
          openEventModal(eventId);
        }
      }

      // Schedule item clicks
      const scheduleItem = e.target.closest('.schedule-item');
      if (scheduleItem && !e.target.closest('button')) {
        const eventId = scheduleItem.dataset.eventId;
        if (eventId) {
          openEventModal(eventId);
        }
      }

      const quickScheduleTrigger = e.target.closest('[data-open-quick-schedule]');
      if (quickScheduleTrigger) {
        e.preventDefault();
        openEventModal();
      }

      const quickDateBtn = e.target.closest('#eventQuickDateRow [data-quick-date]');
      if (quickDateBtn) {
        e.preventDefault();
        const { dateInput, recurrenceInput, recurrenceUnit } = getModalElements();
        if (!dateInput) return;
        modalState.activeQuickDate = quickDateBtn.dataset.quickDate || '';
        dateInput.value = formatDateStr(resolveQuickDate(modalState.activeQuickDate));
        const isWeekdayRecurrence = recurrenceInput?.value === 'weekly' || (recurrenceInput?.value === 'custom' && recurrenceUnit?.value === 'weeks');
        if (isWeekdayRecurrence && !modalState.manualWeekdays) {
          setSelectedWeekdays([parseDateValue(dateInput.value).getDay()]);
        }
        applySuggestedTiming({ forceDate: true, forceTime: true });
        syncRecurrenceUi();
        updateEventPreview();
        return;
      }

      const weekdayBtn = e.target.closest('#eventWeekdayWrap [data-weekday]');
      if (weekdayBtn) {
        e.preventDefault();
        const { recurrenceInput, recurrenceUnit } = getModalElements();
        const weekday = Number(weekdayBtn.dataset.weekday);
        const isCustomWeekly = recurrenceInput?.value === 'custom' && recurrenceUnit?.value === 'weeks';
        if (recurrenceInput && recurrenceInput.value !== 'weekly' && !isCustomWeekly) {
          recurrenceInput.value = 'weekly';
          modalState.manualWeekdays = false;
          syncRecurrenceUi();
        }
        if (!modalState.manualWeekdays) {
          // Treat the initial highlighted weekday as a suggestion. The first
          // manual pick replaces it so "Mon + Thu" does not silently keep the
          // auto-selected day as an extra recurrence.
          setSelectedWeekdays([weekday]);
          modalState.manualWeekdays = true;
        } else {
          weekdayBtn.classList.toggle('is-selected');
        }
        updateEventPreview();
      }
    });

    // Modal controls
    const modal = $('#calendarEventModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.dataset.close === '1' || e.target.classList.contains('modal-backdrop')) {
          closeEventModal();
        }
      });
    }

    const saveBtn = $('#eventSaveBtn');
    const deleteBtn = $('#eventDeleteBtn');
    const outlineSelect = $('#eventOutlineSelect');
    const dateInput = $('#eventDateInput');
    const timeInput = $('#eventTimeInput');
    const endTimeInput = $('#eventEndTimeInput');
    const allDayInput = $('#eventAllDayInput');
    const recurrenceInput = $('#eventRecurrenceInput');
    const recurrenceUnit = $('#eventRecurrenceUnit');
    const recurrenceEnd = $('#eventRecurrenceEnd');
    const notesInput = $('#eventNotesInput');
    const endDateInput = $('#eventEndDateInput');
    const topbarQuickScheduleBtn = $('#topbarQuickScheduleBtn');
    const savedQuickScheduleBtn = $('#savedQuickScheduleBtn');
    const calendarQuickScheduleBtn = $('#calendarQuickScheduleBtn');

    if (saveBtn) saveBtn.addEventListener('click', saveEvent);
    if (deleteBtn) deleteBtn.addEventListener('click', deleteEvent);
    if (outlineSelect) {
      outlineSelect.addEventListener('change', () => {
        applySuggestedTiming({ forceTime: !$('#eventTimeInput')?.value });
        updateEventPreview();
      });
    }
    if (dateInput) {
      dateInput.addEventListener('change', () => {
        modalState.activeQuickDate = '';
        const isWeekdayRecurrence = recurrenceInput?.value === 'weekly' || (recurrenceInput?.value === 'custom' && recurrenceUnit?.value === 'weeks');
        if (isWeekdayRecurrence && !modalState.manualWeekdays && dateInput.value) {
          setSelectedWeekdays([parseDateValue(dateInput.value).getDay()]);
        }
        applySuggestedTiming({ forceDate: false, forceTime: !timeInput?.value });
        syncRecurrenceUi();
        updateEventPreview();
      });
    }
    if (timeInput) {
      timeInput.addEventListener('change', () => {
        applySuggestedTiming();
        updateEventPreview();
      });
    }
    if (endTimeInput) {
      endTimeInput.addEventListener('input', () => {
        modalState.manualEndTime = true;
        updateEventPreview();
      });
    }
    if (allDayInput) {
      allDayInput.addEventListener('change', () => {
        const { timeRow } = getModalElements();
        if (timeRow) timeRow.style.display = allDayInput.checked ? 'none' : 'grid';
        applySuggestedTiming();
        updateEventPreview();
      });
    }
    if (recurrenceInput) {
      recurrenceInput.addEventListener('change', () => {
        modalState.manualWeekdays = false;
        syncRecurrenceUi();
        updateEventPreview();
      });
    }
    if (recurrenceUnit) {
      recurrenceUnit.addEventListener('change', () => {
        syncRecurrenceUi();
        updateEventPreview();
      });
    }
    if (recurrenceEnd) {
      recurrenceEnd.addEventListener('change', () => {
        syncRecurrenceUi();
        updateEventPreview();
      });
    }
    if (notesInput) notesInput.addEventListener('input', updateEventPreview);
    if (endDateInput) endDateInput.addEventListener('change', updateEventPreview);
    if (topbarQuickScheduleBtn) topbarQuickScheduleBtn.addEventListener('click', () => openEventModal());
    if (savedQuickScheduleBtn) savedQuickScheduleBtn.addEventListener('click', () => openEventModal());
    if (calendarQuickScheduleBtn) calendarQuickScheduleBtn.addEventListener('click', () => openEventModal());

    // Add calendar button
    const addCalBtn = $('#addCalendarBtn');
    if (addCalBtn) {
      addCalBtn.addEventListener('click', () => {
        const name = prompt('Enter calendar name:');
        if (name && name.trim()) {
          addCalendar(name.trim());
        }
      });
    }
  }

  // ============================================
  // MINI CALENDAR
  // ============================================

  function renderMiniCalendar() {
    const container = $('#miniCalendar');
    if (!container) return;

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const prevLastDay = new Date(currentYear, currentMonth, 0);
    const firstDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const daysInPrevMonth = prevLastDay.getDate();

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];

    let html = `
      <div class="mini-calendar-header">
        <span class="mini-calendar-title">${monthNames[currentMonth]} ${currentYear}</span>
        <div class="mini-calendar-nav">
          <button data-mini-prev>‹</button>
          <button data-mini-next>›</button>
        </div>
      </div>
      <div class="mini-calendar-grid">
    `;

    // Day names
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(d => {
      html += `<div class="mini-calendar-day-name">${d}</div>`;
    });

    const today = new Date();
    const todayStr = formatDateStr(today);

    // Previous month days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      html += `<div class="mini-calendar-day other-month">${day}</div>`;
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      html += `<div class="mini-calendar-day ${isToday ? 'today' : ''}" data-date="${dateStr}">${day}</div>`;
    }

    // Next month days
    const totalCells = firstDayOfWeek + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
      html += `<div class="mini-calendar-day other-month">${day}</div>`;
    }

    html += '</div>';
    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.mini-calendar-day:not(.other-month)').forEach(el => {
      el.addEventListener('click', () => {
        const date = el.dataset.date;
        if (date) {
          openEventModal(null, date);
        }
      });
    });

    container.querySelector('[data-mini-prev]')?.addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      renderMiniCalendar();
      renderCalendar();
    });

    container.querySelector('[data-mini-next]')?.addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      renderMiniCalendar();
      renderCalendar();
    });
  }

  // ============================================
  // ALL-DAY EVENTS BANNER
  // ============================================

  function renderAllDayEventsBanner(weekStart) {
    const allDayRow = $('#weekAllDayRow');
    const allDayEvents = $('#weekAllDayEvents');
    if (!allDayRow || !allDayEvents) return;

    // Collect all-day events for the week
    let hasAllDayEvents = false;
    let html = '';

    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      const dateStr = formatDateStr(day);

      const events = getAllDayEventsForDate(dateStr);
      html += `<div class="week-allday-cell" data-date="${dateStr}">`;

      events.forEach(event => {
        hasAllDayEvents = true;
        const cal = getCalendarById(event.calendarId || 'cal_default');
        const isSpanning = event.endDate && event.endDate !== event.date;
        const eventStart = new Date(event.date + 'T00:00:00');
        const eventEnd = event.endDate ? new Date(event.endDate + 'T00:00:00') : eventStart;
        const isFirstDay = day.getTime() === eventStart.getTime();
        const isLastDay = day.getTime() === eventEnd.getTime();

        let spanClass = '';
        if (isSpanning) {
          spanClass = 'spanning';
          if (isFirstDay) spanClass += ' span-start';
          if (isLastDay) spanClass += ' span-end';
        }

        // Only show title on first day
        const showTitle = isFirstDay || !isSpanning;

        html += `<div class="week-allday-event ${spanClass}"
                      data-event-id="${event.id}"
                      style="background: ${cal?.color || event.color || '#0ea5e9'}">
          ${showTitle ? (event.title || 'Untitled') : '&nbsp;'}
        </div>`;
      });

      html += '</div>';
    }

    allDayEvents.innerHTML = html;
    allDayRow.style.display = hasAllDayEvents ? 'grid' : 'none';

    // Add click handlers
    allDayEvents.querySelectorAll('.week-allday-event').forEach(el => {
      el.addEventListener('click', () => {
        const eventId = el.dataset.eventId;
        if (eventId) openEventModal(eventId);
      });
    });
  }

  // Initialize
  function init() {
    setupEventListeners();
    renderCalendarList();
    renderMiniCalendar();
    renderCalendar();
    renderScheduleSurfaces();
    if (modalState.clockRefresh) clearInterval(modalState.clockRefresh);
    modalState.clockRefresh = setInterval(() => {
      renderScheduleSurfaces();
    }, 60000);
  }

  // Export to window
  window.renderCalendar = renderCalendar;
  window.openEventModal = openEventModal;
  window.startEventSession = startEventSession;
  window.updateEventPreview = updateEventPreview;
  window.renderOverviewSchedule = renderOverviewSchedule;
  window.renderSessionSchedule = renderSessionSchedule;
  window.renderSavedSchedule = renderSavedSchedule;
  window.renderScheduleSurfaces = renderScheduleSurfaces;

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
