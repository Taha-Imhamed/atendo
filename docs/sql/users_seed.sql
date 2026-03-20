-- Seed users/courses/groups/enrollments for Attendo
-- Passwords (plain text):
-- professor      / Professor123!
-- student        / Student123!
-- prof.mariam    / Mariam123!
-- student.ahmed  / Ahmed123!
-- student.sara   / Sara123!

BEGIN;

INSERT INTO users (id, role, email, username, display_name, password)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'professor', 'professor@university.edu', 'professor', 'Main Professor', '93ad649dff4c1bc601a753199184166e:98d1650986b9f9357e41e2bbd6370cfb3254f70e3d95a93db1aa885f1e10fc6344af4e61ff85fc3a41073086d1db25a5b206e19bbeb1552cf897ab9b382a6c9b'),
  ('22222222-2222-2222-2222-222222222222', 'student', 'student@university.edu', 'student', 'Main Student', '59f5f9ed243de6c9ca1d39c70344e3c9:b512d586c0810448ae4a8c4e45d99c856ee36cf578a194e9ea0b1484f86d40004e39eaaac886e7937697935ffea0fc182d8091768d31b983cc8c8cfdb5d0faf6'),
  ('33333333-3333-3333-3333-333333333333', 'professor', 'mariam@university.edu', 'prof.mariam', 'Prof. Mariam', 'a618e7397cb4cca511df352f8524a8cb:26efaded2d863c2ab062c922ced82041a3612b6d76146f99eeb93e3a0d39bb0621d5a31d79b17791b08ae64b85902af2604903f822a479db0902f1984ddae532'),
  ('44444444-4444-4444-4444-444444444444', 'student', 'ahmed@university.edu', 'student.ahmed', 'Ahmed Youssef', 'f92fd66cbaf4f9fc0a61c41ee1b642cd:fede418c387581f488936f7e31165f5bf9a644072041911a9018b98f55649d8fd4c3552281a0ea003f1c05849605d3b69563b7bb2bb7e524f639b328fa4997b5'),
  ('55555555-5555-5555-5555-555555555555', 'student', 'sara@university.edu', 'student.sara', 'Sara Adel', '4eb0ff40c0b02f453f7ef9bab7844c2e:109d46763d37237cb537a7ce25f93a458d5aa68e7a1a06385e413d2577408a1c30078b3dc302d8e714d6f41ee342bebd1fec794c3ec6b2522a00fabcb25803d4')
ON CONFLICT(username) DO NOTHING;

INSERT INTO courses (id, professor_id, code, name, term, description)
VALUES
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'CS-101', 'Foundations of Computing', 'Fall 2026', 'Core first year class'),
  ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', 'SE-220', 'Software Engineering', 'Fall 2026', 'Project-focused class')
ON CONFLICT DO NOTHING;

INSERT INTO groups (id, course_id, name, meeting_schedule)
VALUES
  ('88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', 'A', 'Mon/Wed 10:00'),
  ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777', 'B', 'Tue/Thu 13:00')
ON CONFLICT DO NOTHING;

INSERT INTO enrollments (id, student_id, course_id, group_id)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666666', '88888888-8888-8888-8888-888888888888'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', '66666666-6666-6666-6666-666666666666', '88888888-8888-8888-8888-888888888888'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777777', '99999999-9999-9999-9999-999999999999')
ON CONFLICT(id) DO NOTHING;

COMMIT;
