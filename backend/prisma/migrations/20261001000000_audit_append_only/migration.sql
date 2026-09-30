-- Phase 16: the audit trail is append-only (spec §55). There is no update/delete API;
-- these triggers also reject UPDATE and DELETE issued directly against the database.
-- Single-statement trigger bodies (no BEGIN...END) so the script needs no DELIMITER.
-- Foreign-key actions do not fire MySQL triggers; users are deactivated, never deleted.
CREATE TRIGGER `audit_logs_no_update` BEFORE UPDATE ON `audit_logs` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only: UPDATE is not allowed';

CREATE TRIGGER `audit_logs_no_delete` BEFORE DELETE ON `audit_logs` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only: DELETE is not allowed';
