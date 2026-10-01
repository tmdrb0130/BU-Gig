ALTER TABLE reviews ADD COLUMN home_featured_opt_in boolean NOT NULL DEFAULT false;
CREATE INDEX home_reviews_eligible ON reviews(created_at DESC,id) WHERE visibility='PUBLIC' AND home_featured_opt_in=true AND subject_role='PROVIDER';
