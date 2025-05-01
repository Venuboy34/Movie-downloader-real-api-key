// index.js - Main server file
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// TMDB Configuration
const TMDB_API_KEY = process.env.TMDB_API_KEY || '3a08a646f83edac9a48438ac670a78b2';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// Site scraping configurations
const SITES = {
  tamil: {
    url: 'http://mv.tamiltech.live',
    searchEndpoint: '/search',
    selectors: {
      movieCard: '.movie-card',
      title: '.movie-title',
      link: 'a',
      downloadLinks: '.download-links a',
      streamLinks: '.stream-links a'
    }
  },
  english: {
    url: 'https://www.filmxy.vip',
    searchEndpoint: '/search',
    selectors: {
      movieCard: '.result-item',
      title: '.title',
      link: '.image a',
      downloadLinks: '.links_table a',
      streamLinks: '.player-option-tab a'
    }
  },
  english_hdhub: {
    url: 'https://hdhub4u.graphics',
    searchEndpoint: '/?s=',
    selectors: {
      movieCard: '.post',
      title: '.post-title',
      link: '.entry-image a',
      downloadLinks: '.download-link',
      streamLinks: '.watch-link'
    }
  },
  hindi: {
    url: 'https://hdhub4u.graphics',
    searchEndpoint: '/?s=',
    selectors: {
      movieCard: '.post',
      title: '.post-title',
      link: '.entry-image a',
      downloadLinks: '.download-link',
      streamLinks: '.watch-link'
    }
  }
};

// API Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Movie Scraper API',
    endpoints: {
      '/search/:query': 'Search for movies by query using TMDB',
      '/movie/:language/:id': 'Get movie details by ID from TMDB and scrape links',
      '/trending/:language': 'Get trending movies by language',
      '/latest/:language': 'Get latest movies by language'
    },
    languages: {
      tamil: 'Tamil movies from mv.tamiltech.live',
      english: 'English movies from filmxy.vip and hdhub4u.graphics',
      hindi: 'Hindi movies from hdhub4u.graphics'
    }
  });
});

// Search for movies using TMDB
app.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const response = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        query: query,
        include_adult: false
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error searching movies:', error);
    res.status(500).json({ error: 'Failed to search movies' });
  }
});

// Get movie details from TMDB and scrape links
app.get('/movie/:language/:id', async (req, res) => {
  try {
    const { language, id } = req.params;
    
    // Get movie details from TMDB
    const movieDetails = await fetchMovieDetailsFromTMDB(id);
    
    // Scrape download and streaming links
    let movieLinks = await scrapeMovieLinks(language, movieDetails.title);
    
    // For English movies, also fetch from HDHub4u
    if (language === 'english') {
      const hdhubLinks = await scrapeMovieLinks('english_hdhub', movieDetails.title);
      
      // Merge links from both sources
      movieLinks = {
        download: [...movieLinks.download, ...hdhubLinks.download],
        stream: [...movieLinks.stream, ...hdhubLinks.stream],
        sources: {
          filmxy: {
            download: movieLinks.download,
            stream: movieLinks.stream
          },
          hdhub4u: {
            download: hdhubLinks.download,
            stream: hdhubLinks.stream
          }
        }
      };
    }
    
    res.json({
      ...movieDetails,
      links: movieLinks
    });
  } catch (error) {
    console.error('Error getting movie details:', error);
    res.status(500).json({ error: 'Failed to get movie details' });
  }
});

// Get trending movies
app.get('/trending/:language', async (req, res) => {
  try {
    const { language } = req.params;
    const tmdbLanguage = language === 'tamil' ? 'ta' : language === 'hindi' ? 'hi' : 'en';
    
    const response = await axios.get(`${TMDB_BASE_URL}/trending/movie/week`, {
      params: {
        api_key: TMDB_API_KEY,
        language: tmdbLanguage
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error getting trending movies:', error);
    res.status(500).json({ error: 'Failed to get trending movies' });
  }
});

// Get latest movies
app.get('/latest/:language', async (req, res) => {
  try {
    const { language } = req.params;
    
    // Handle special case for English to get from both sources
    if (language === 'english') {
      const filmxyMovies = await scrapeLatestMovies('english');
      const hdhubMovies = await scrapeLatestMovies('english_hdhub');
      
      // Combine results with source information
      const combinedResults = {
        results: [...filmxyMovies, ...hdhubMovies],
        sources: {
          filmxy: filmxyMovies,
          hdhub4u: hdhubMovies
        }
      };
      
      return res.json(combinedResults);
    }
    
    // Regular case for other languages
    const siteConfig = SITES[language];
    
    if (!siteConfig) {
      return res.status(400).json({ error: 'Invalid language' });
    }
    
    const latestMovies = await scrapeLatestMovies(language);
    res.json({ results: latestMovies });
  } catch (error) {
    console.error('Error getting latest movies:', error);
    res.status(500).json({ error: 'Failed to get latest movies' });
  }
});

// Helper Functions
async function fetchMovieDetailsFromTMDB(movieId) {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
      params: {
        api_key: TMDB_API_KEY,
        append_to_response: 'credits,videos,images'
      }
    });
    
    const movie = response.data;
    
    // Format the data
    return {
      id: movie.id,
      title: movie.title,
      original_title: movie.original_title,
      overview: movie.overview,
      poster: movie.poster_path ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}` : null,
      backdrop: movie.backdrop_path ? `${TMDB_IMAGE_BASE_URL}${movie.backdrop_path}` : null,
      release_date: movie.release_date,
      runtime: movie.runtime,
      genres: movie.genres,
      vote_average: movie.vote_average,
      cast: movie.credits?.cast?.slice(0, 10).map(actor => ({
        id: actor.id,
        name: actor.name,
        character: actor.character,
        profile: actor.profile_path ? `${TMDB_IMAGE_BASE_URL}${actor.profile_path}` : null
      })),
      director: movie.credits?.crew?.find(person => person.job === 'Director')?.name || 'Unknown',
      trailer: movie.videos?.results?.find(video => 
        video.type === 'Trailer' && video.site === 'YouTube'
      )?.key || null
    };
  } catch (error) {
    console.error('Error fetching movie details from TMDB:', error);
    throw error;
  }
}

async function scrapeMovieLinks(language, title) {
  try {
    const siteConfig = SITES[language];
    
    if (!siteConfig) {
      throw new Error('Invalid language');
    }
    
    // Search for the movie on the specified site
    const searchUrl = `${siteConfig.url}${siteConfig.searchEndpoint}${language === 'hindi' || language === 'english_hdhub' ? title : ''}`;
    const searchResponse = await axios.get(searchUrl, {
      params: language !== 'hindi' && language !== 'english_hdhub' ? { s: title } : {},
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 5000 // 5 second timeout to prevent hanging
    }).catch(error => {
      console.log(`Error searching ${language} for ${title}: ${error.message}`);
      return { data: '' }; // Return empty data to prevent further errors
    });
    
    const $ = cheerio.load(searchResponse.data);
    const movieCards = $(siteConfig.selectors.movieCard);
    
    if (movieCards.length === 0) {
      return { download: [], stream: [] };
    }
    
    // Find the most relevant movie card
    let relevantMovieUrl;
    movieCards.each((i, card) => {
      const cardTitle = $(card).find(siteConfig.selectors.title).text().trim();
      if (cardTitle.toLowerCase().includes(title.toLowerCase())) {
        relevantMovieUrl = $(card).find(siteConfig.selectors.link).attr('href');
        return false; // Break the loop
      }
    });
    
    if (!relevantMovieUrl) {
      relevantMovieUrl = $(movieCards[0]).find(siteConfig.selectors.link).attr('href');
    }
    
    if (!relevantMovieUrl) {
      return { download: [], stream: [] };
    }
    
    // Visit the movie page to get download and streaming links
    const moviePageResponse = await axios.get(relevantMovieUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $movie = cheerio.load(moviePageResponse.data);
    
    // Extract download links
    const downloadLinks = [];
    $movie(siteConfig.selectors.downloadLinks).each((i, link) => {
      const linkUrl = $movie(link).attr('href');
      const linkText = $movie(link).text().trim();
      if (linkUrl && !linkUrl.startsWith('#')) {
        downloadLinks.push({
          url: linkUrl,
          quality: extractQuality(linkText),
          size: extractSize(linkText)
        });
      }
    });
    
    // Extract streaming links
    const streamLinks = [];
    $movie(siteConfig.selectors.streamLinks).each((i, link) => {
      const linkUrl = $movie(link).attr('href') || $movie(link).attr('data-link');
      const linkText = $movie(link).text().trim();
      if (linkUrl && !linkUrl.startsWith('#')) {
        streamLinks.push({
          url: linkUrl,
          quality: extractQuality(linkText),
          server: extractServer(linkText)
        });
      }
    });
    
    return {
      download: downloadLinks,
      stream: streamLinks
    };
  } catch (error) {
    console.error(`Error scraping ${language} movie links:`, error);
    return { download: [], stream: [] };
  }
}

async function scrapeLatestMovies(language) {
  try {
    const siteConfig = SITES[language];
    
    if (!siteConfig) {
      throw new Error('Invalid language');
    }
    
    const response = await axios.get(siteConfig.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    const movieCards = $(siteConfig.selectors.movieCard).slice(0, 20);
    const movies = [];
    
    movieCards.each((i, card) => {
      const title = $(card).find(siteConfig.selectors.title).text().trim();
      const link = $(card).find(siteConfig.selectors.link).attr('href');
      let poster = $(card).find('img').attr('src') || $(card).find('img').attr('data-src');
      
      if (title && link) {
        movies.push({
          title,
          link,
          poster
        });
      }
    });
    
    return movies;
  } catch (error) {
    console.error(`Error scraping latest ${language} movies:`, error);
    return [];
  }
}

// Utility functions
function extractQuality(text) {
  const qualityPatterns = [
    /(\d{3,4}p)/i,
    /(HD|SD|Full HD|UHD|4K)/i
  ];
  
  for (const pattern of qualityPatterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  
  return 'Unknown';
}

function extractSize(text) {
  const sizePattern = /(\d+(\.\d+)?\s*(GB|MB|KB))/i;
  const match = text.match(sizePattern);
  return match ? match[1] : 'Unknown';
}

function extractServer(text) {
  const serverPatterns = [
    /(gdrive|google drive)/i,
    /(mega)/i,
    /(vimeo)/i,
    /(youtube)/i,
    /(dailymotion)/i,
    /(streamable)/i,
    /(openload)/i,
    /(vidcloud)/i
  ];
  
  for (const pattern of serverPatterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  
  return 'Unknown';
}

// Start server only if not running on Vercel
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
