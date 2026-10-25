ALTER TABLE accounts ADD COLUMN verification_method TEXT CHECK(verification_method IN ('email','judge'));
