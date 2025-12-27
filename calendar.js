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

    const occurrences = [];
    const startDate = new Date(event.date + 'T00:00:00');
    const rec = event.recurrence;

    // Determine recurrence interval
    let interval = rec.interval || 1;
    let unit = rec.unit || 'days';

    // Handle preset recurrence types
    if (rec.type) {
      switch (rec.type) {
        case 'daily': unit = 'days'; interval = 1; break;
        case 'weekly': unit = 'weeks'; interval = 1; break;
        case 'monthly': unit = 'months'; interval = 1; break;
        case 'yearly': unit = 'years'; interval = 1; break;
      }
    }

    // Calculate end condition
    let maxOccurrences = rec.count || 365; // Default max
    let endDate = rangeEnd;
    if (rec.endDate) {
      endDate = new Date(Math.min(new Date(rec.endDate).getTime(), rangeEnd.getTime()));
    }

    let currentDate = new Date(startDate);
    let count = 0;

    while (currentDate <= endDate && count < maxOccurrences) {
      if (currentDate >= rangeStart) {
        const dateStr = formatDateStr(currentDate);
        occurrences.push({
          ...event,
          date: dateStr,
          isRecurrenceInstance: count > 0,
          originalDate: event.date,
          instanceIndex: count
        });
      }

      // Advance to next occurrence
      switch (unit) {
        case 'days':
          currentDate.setDate(currentDate.getDate() + interval);
          break;
        case 'weeks':
          currentDate.setDate(currentDate.getDate() + (interval * 7));
          break;
        case 'months':
          currentDate.setMonth(currentDate.getMonth() + interval);
          break;
        case 'years':
          currentDate.setFullYear(currentDate.getFullYear() + interval);
          break;
      }

      count++;
    }

    return occurrences;
  }

  /**
   * Format date to YYYY-MM-DD string
   */
  function formatDateStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
        const eventDate = new Date(event.date + 'T00:00:00');
        const eventEndDate = event.endDate ? new Date(event.endDate + 'T23:59:59') : eventDate;

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
    let endMinutes = timeToMinutes(event.endTime);

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

    // Use custom duration if set (from resize), otherwise use outline duration
    let duration;
    if (event.customDuration) {
      duration = event.customDuration;
    } else {
      const outline = getOutlineById(event.outlineId);
      duration = outline ? getTotalDuration(outline.sections) : 60; // Default 1 hour
    }

    return Math.min(startMinutes + duration, 24 * 60); // Cap at midnight
  }

  // Get calendar events from global state
  function getCalendarEvents() {
    return window.calendarEvents || [];
  }

  // Save calendar events to global state
  function saveCalendarEvents(events) {
    window.calendarEvents = events;
    try {
      localStorage.setItem('calendar_events_v1', JSON.stringify(events));
      if (window.markDirty) window.markDirty();
    } catch(e) {
      console.error('Failed to save calendar events:', e);
    }
  }

  // Get saved outlines from global state
  function getSavedOutlines() {
    // Try multiple possible locations where savedOutlines might be stored
    if (window.savedOutlines && Array.isArray(window.savedOutlines)) {
      return window.savedOutlines;
    }
    // Try loading from localStorage as fallback
    try {
      const stored = localStorage.getItem('saved_outlines_v1');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch(e) {
      console.error('Failed to load outlines:', e);
    }
    return [];
  }

  // Get outline by ID
  function getOutlineById(id) {
    const outlines = getSavedOutlines();
    return outlines.find(o => o.id === id);
  }

  // Format date helpers
  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  // Get events for a specific date (filters by visibility and includes multi-day)
  function getEventsForDate(dateStr) {
    const events = getCalendarEvents();
    const visibleCalIds = getVisibleCalendarIds();
    const targetDate = new Date(dateStr + 'T00:00:00');

    return events.filter(e => {
      // Filter by visible calendars
      const calId = e.calendarId || 'cal_default';
      if (!visibleCalIds.includes(calId)) return false;

      // Check if event is on this date (including multi-day)
      const eventStart = new Date(e.date + 'T00:00:00');
      const eventEnd = e.endDate ? new Date(e.endDate + 'T23:59:59') : eventStart;

      return targetDate >= eventStart && targetDate <= eventEnd;
    });
  }

  // Get timed events only (exclude all-day and multi-day)
  function getTimedEventsForDate(dateStr) {
    return getEventsForDate(dateStr).filter(e => !isAllDayEvent(e));
  }

  // Get all-day and multi-day events for a date
  function getAllDayEventsForDate(dateStr) {
    return getEventsForDate(dateStr).filter(e => isAllDayEvent(e));
  }

  // Calculate total duration from sections
  function getTotalDuration(sections) {
    if (!sections || !Array.isArray(sections)) return 0;
    return sections.reduce((sum, s) => sum + (s.minutes || 0), 0);
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
          const outline = getOutlineById(event.outlineId);
          const duration = outline ? getTotalDuration(outline.sections) : 0;
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
      html += `<button class="px-2 py-1 rounded-lg bg-[var(--accent)] text-white text-xs" onclick="window.startEventSession('${event.id}')">Start</button>`;
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
      html += `<button class="px-2 py-1 rounded-lg bg-[var(--accent)] text-white text-xs" onclick="window.startEventSession('${event.id}')">Start</button>`;
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
      html += `<button class="px-2 py-1 rounded-lg bg-[var(--accent)] text-white text-xs" onclick="window.startEventSession('${event.id}')">Start</button>`;
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
    const outline = getOutlineById(event.outlineId);
    const duration = outline ? getTotalDuration(outline.sections) : 60;

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
        monthBtn.classList.add('bg-[var(--accent)]', 'text-white');
        monthBtn.classList.remove('border', 'border-[var(--border)]');
      }
      if (weekBtn) {
        weekBtn.classList.remove('bg-[var(--accent)]', 'text-white');
        weekBtn.classList.add('border', 'border-[var(--border)]');
      }
    } else {
      renderWeekView();
      if (calGrid && calGrid.parentElement) {
        calGrid.parentElement.style.display = 'none';
      }
      if (weekViewEl) weekViewEl.style.display = 'block';

      if (weekBtn) {
        weekBtn.classList.add('bg-[var(--accent)]', 'text-white');
        weekBtn.classList.remove('border', 'border-[var(--border)]');
      }
      if (monthBtn) {
        monthBtn.classList.remove('bg-[var(--accent)]', 'text-white');
        monthBtn.classList.add('border', 'border-[var(--border)]');
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

    if (saveBtn) saveBtn.addEventListener('click', saveEvent);
    if (deleteBtn) deleteBtn.addEventListener('click', deleteEvent);
    if (outlineSelect) outlineSelect.addEventListener('change', updateEventPreview);

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
  }

  // Export to window
  window.renderCalendar = renderCalendar;
  window.openEventModal = openEventModal;
  window.startEventSession = startEventSession;
  window.updateEventPreview = updateEventPreview;
  window.renderOverviewSchedule = renderOverviewSchedule;
  window.renderSessionSchedule = renderSessionSchedule;

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
