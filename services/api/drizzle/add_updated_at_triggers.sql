-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for oauth_identities table
CREATE TRIGGER update_oauth_identities_updated_at 
  BEFORE UPDATE ON oauth_identities
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Note: Run this migration manually after drizzle-kit push
-- Or add to Drizzle migrations folder
