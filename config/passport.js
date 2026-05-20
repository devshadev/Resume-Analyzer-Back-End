import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import User from '../models/User.js';

const configurePassport = () => {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL,
        scope: ['user:email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Get primary email from GitHub profile
          const email =
            profile.emails?.[0]?.value ||
            `${profile.username}@github.com`;

          // Check if user already exists with this GitHub ID
          let user = await User.findOne({ githubId: profile.id });

          if (user) {
            // Existing GitHub user — just return them
            return done(null, user);
          }

          // Check if user exists with same email (registered with password)
          user = await User.findOne({ email });

          if (user) {
            // Link GitHub to existing account
            user.githubId = profile.id;
            user.githubUsername = profile.username;
            if (!user.avatar) {
              user.avatar = profile.photos?.[0]?.value || null;
            }
            await user.save();
            return done(null, user);
          }

          // Brand new user — create account
          user = await User.create({
            name: profile.displayName || profile.username,
            email,
            githubId: profile.id,
            githubUsername: profile.username,
            avatar: profile.photos?.[0]?.value || null,
            isVerified: true, // GitHub already verified their email
          });

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
};

export default configurePassport;