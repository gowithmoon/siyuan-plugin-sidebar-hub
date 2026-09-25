export interface CalendarDay {
    date: string;
    day: number;
    isCurrentMonth: boolean;
    isToday: boolean;
}

export interface CalendarMonth {
    year: number;
    month: number;
    days: CalendarDay[];
}

const calendarFormatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

export function buildCalendarMonth(year: number, month: number, today: Date): CalendarMonth {
    const firstDay = new Date(year, month, 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - mondayOffset);
    const todayKey = toDateKey(today);

    return {
        year: firstDay.getFullYear(),
        month: firstDay.getMonth(),
        days: Array.from({ length: 42 }, (_, index) => {
            const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
            const dateKey = toDateKey(date);
            return {
                date: dateKey,
                day: date.getDate(),
                isCurrentMonth: date.getMonth() === firstDay.getMonth(),
                isToday: dateKey === todayKey,
            };
        }),
    };
}

function toDateKey(date: Date) {
    return calendarFormatter.format(date);
}
