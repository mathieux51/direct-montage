#!/bin/bash
set -e

echo "🚀 Starting deployment for direct-montage..."

# Install Vercel CLI
echo "📦 Installing Vercel CLI..."
npm i -g vercel@latest

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
vercel deploy \
  --yes \
  --token $NOW_TOKEN \
  --scope $TEAM \
  --meta gitCommitSha=$GITHUB_SHA \
  --meta gitCommitRef=$GITHUB_REF \
  --meta gitRepo=$GITHUB_REPOSITORY

# Alias production deployment
echo "🌐 Setting up production alias..."
vercel alias \
  --yes \
  --token $NOW_TOKEN \
  --scope $TEAM \
  $ALIAS

echo "✅ Deployment completed successfully!"
echo "🌐 Site is live at: https://$ALIAS"