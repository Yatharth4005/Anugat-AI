"use strict";
// ─── Enums ───────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERIOD_TIMES = exports.EntityStatus = exports.ImportJobStatus = exports.Period = exports.Day = exports.CourseType = exports.RoomType = exports.Role = void 0;
var Role;
(function (Role) {
    Role["ADMIN"] = "ADMIN";
    Role["COORDINATOR"] = "COORDINATOR";
    Role["HOD"] = "HOD";
    Role["DEAN"] = "DEAN";
    Role["PROFESSOR"] = "PROFESSOR";
})(Role || (exports.Role = Role = {}));
var RoomType;
(function (RoomType) {
    RoomType["CLASSROOM"] = "CLASSROOM";
    RoomType["LAB"] = "LAB";
    RoomType["OTHER"] = "OTHER";
})(RoomType || (exports.RoomType = RoomType = {}));
var CourseType;
(function (CourseType) {
    CourseType["LECTURE"] = "LECTURE";
    CourseType["LAB"] = "LAB";
    CourseType["TUTORIAL"] = "TUTORIAL";
})(CourseType || (exports.CourseType = CourseType = {}));
var Day;
(function (Day) {
    Day["MONDAY"] = "MONDAY";
    Day["TUESDAY"] = "TUESDAY";
    Day["WEDNESDAY"] = "WEDNESDAY";
    Day["THURSDAY"] = "THURSDAY";
    Day["FRIDAY"] = "FRIDAY";
})(Day || (exports.Day = Day = {}));
var Period;
(function (Period) {
    Period["I"] = "I";
    Period["II"] = "II";
    Period["III"] = "III";
    Period["IV"] = "IV";
    Period["V"] = "V";
    Period["VI"] = "VI";
    Period["VII"] = "VII";
    Period["VIII"] = "VIII";
    Period["IX"] = "IX";
})(Period || (exports.Period = Period = {}));
var ImportJobStatus;
(function (ImportJobStatus) {
    ImportJobStatus["QUEUED"] = "QUEUED";
    ImportJobStatus["PARSING"] = "PARSING";
    ImportJobStatus["INTEGRATING"] = "INTEGRATING";
    ImportJobStatus["DONE"] = "DONE";
    ImportJobStatus["FAILED"] = "FAILED";
})(ImportJobStatus || (exports.ImportJobStatus = ImportJobStatus = {}));
var EntityStatus;
(function (EntityStatus) {
    EntityStatus["ACTIVE"] = "ACTIVE";
    EntityStatus["PENDING"] = "PENDING";
    EntityStatus["ARCHIVED"] = "ARCHIVED";
})(EntityStatus || (exports.EntityStatus = EntityStatus = {}));
// ─── Period Time Mapping ─────────────────────────────────────────────────────
exports.PERIOD_TIMES = {
    [Period.I]: { start: '09:00', end: '09:50' },
    [Period.II]: { start: '10:00', end: '10:50' },
    [Period.III]: { start: '11:00', end: '11:50' },
    [Period.IV]: { start: '12:00', end: '12:50' },
    [Period.V]: { start: '13:00', end: '13:50' },
    [Period.VI]: { start: '14:00', end: '14:50' },
    [Period.VII]: { start: '15:00', end: '15:50' },
    [Period.VIII]: { start: '16:00', end: '16:50' },
    [Period.IX]: { start: '17:00', end: '17:50' },
};
//# sourceMappingURL=index.js.map