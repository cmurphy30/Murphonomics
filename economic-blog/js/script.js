/* Economic Dashboard - Fetch real data from Federal Reserve API */

document.addEventListener('DOMContentLoaded', () => {
    fetchEconomicData();
    fetchSubstackPosts();
});

async function fetchEconomicData() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const errorMessage = document.getElementById('errorMessage');
    
    try {
        loadingSpinner.style.display = 'flex';
        
        /* Use CORS proxy to bypass browser restrictions */
        const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
        const fredUrl = 'https://api.stlouisfed.org/fred/series/';
        
        /* Try fetching without API key (FRED allows some requests) */
        const gdpUrl = 'https://www.fred.org/data/GDP.txt';
        
        /* Alternative: Use a data source that supports CORS */
        const mockGdpResponse = await fetch(gdpUrl);
        
        if (!mockGdpResponse.ok) {
            /* Use mock data if API is unavailable */
            displayMockData();
            loadingSpinner.style.display = 'none';
            return;
        }
        
        loadingSpinner.style.display = 'none';
        
    } catch (error) {
        console.error('Error fetching data:', error);
        /* Display mock data as fallback */
        displayMockData();
        loadingSpinner.style.display = 'none';
    }
}

/* Display mock/sample economic data */
function displayMockData() {
    /* Mock GDP data (quarterly) */
    const mockGdpObservations = [
        { date: '2023-01-01', value: '27360.1' },
        { date: '2023-04-01', value: '27535.2' },
        { date: '2023-07-01', value: '27815.6' },
        { date: '2023-10-01', value: '28200.5' },
        { date: '2024-01-01', value: '28556.8' },
        { date: '2024-04-01', value: '28754.3' },
        { date: '2024-07-01', value: '29215.7' },
        { date: '2024-10-01', value: '29835.4' }
    ];
    
    /* Mock inflation data */
    const mockInflationObservations = [
        { value: '3.4' },
        { value: '3.2' },
        { value: '3.1' }
    ];
    
    /* Mock unemployment data */
    const mockUnemploymentObservations = [
        { value: '3.8' },
        { value: '4.0' },
        { value: '4.1' }
    ];
    
    /* Mock Fed Rate data */
    const mockFedRateObservations = [
        { value: '5.33' },
        { value: '5.25' },
        { value: '5.00' }
    ];
    
    displayGDPChart(mockGdpObservations);
    updateIndicatorsMock(mockInflationObservations, mockUnemploymentObservations, mockFedRateObservations);
    
    document.getElementById('lastUpdated').textContent = 'Last updated: Sample Data';
}


function displayGDPChart(observations) {
    const validData = observations
        .filter(obs => obs.value && obs.value !== '.')
        .slice(-16);
    
    if (validData.length === 0) return;
    
    const labels = validData.map(obs => obs.date);
    const values = validData.map(obs => parseFloat(obs.value));
    
    const backgroundColors = values.map((value, index) => {
        if (index === 0) return '#2563eb';
        const change = value - values[index - 1];
        return change >= 0 ? '#3b82f6' : '#1e40af';
    });
    
    const ctx = document.getElementById('gdpChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'GDP (Billions USD)',
                data: values,
                backgroundColor: backgroundColors,
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#1f2937',
                        font: {
                            weight: 500
                        }
                    },
                    grid: {
                        color: 'rgba(30, 64, 175, 0.1)',
                        drawBorder: false
                    }
                },
                y: {
                    beginAtZero: false,
                    ticks: {
                        color: '#1f2937',
                        font: {
                            weight: 500
                        },
                        callback: function(value) {
                            return '$' + value + 'B';
                        }
                    },
                    grid: {
                        color: 'rgba(30, 64, 175, 0.1)',
                        drawBorder: false
                    }
                }
            }
        }
    });
}

function updateIndicators(inflationData, unemploymentData, fedRateData) {
    const latestInflation = inflationData.observations
        .filter(obs => obs.value && obs.value !== '.')
        .pop();
    
    const latestUnemployment = unemploymentData.observations
        .filter(obs => obs.value && obs.value !== '.')
        .pop();
    
    const latestFedRate = fedRateData.observations
        .filter(obs => obs.value && obs.value !== '.')
        .pop();
    
    const inflationYoY = calculateYoYChange(inflationData.observations);
    
    if (latestInflation) {
        document.getElementById('inflationRate').textContent = inflationYoY.toFixed(2) + '%';
    }
    
    if (latestUnemployment) {
        document.getElementById('unemploymentRate').textContent = parseFloat(latestUnemployment.value).toFixed(2) + '%';
    }
    
    if (latestFedRate) {
        document.getElementById('fedRate').textContent = parseFloat(latestFedRate.value).toFixed(2) + '%';
    }
}

function updateIndicatorsMock(inflationData, unemploymentData, fedRateData) {
    /* Get the last values from mock data */
    const latestInflation = inflationData[inflationData.length - 1];
    const latestUnemployment = unemploymentData[unemploymentData.length - 1];
    const latestFedRate = fedRateData[fedRateData.length - 1];
    
    document.getElementById('inflationRate').textContent = latestInflation.value + '%';
    document.getElementById('unemploymentRate').textContent = latestUnemployment.value + '%';
    document.getElementById('fedRate').textContent = latestFedRate.value + '%';
}

async function fetchSubstackPosts() {
    const container = document.getElementById('substackPosts');
    if (!container) return;

    try {
        /* Substack RSS feeds support CORS — fetch directly */
        const response = await fetch('https://murphonomics.substack.com/feed');

        if (!response.ok) throw new Error('Feed unavailable');

        const text = await response.text();
        const xml = new DOMParser().parseFromString(text, 'text/xml');
        const items = Array.from(xml.querySelectorAll('item'));

        if (items.length === 0) {
            container.innerHTML = '<p class="substack-error">No posts yet. <a href="https://murphonomics.substack.com/" target="_blank" rel="noopener noreferrer">Visit Substack</a> to get started.</p>';
            return;
        }

        /* RSS is already newest-first but sort to be safe */
        const posts = items.map(item => {
            const rawLink = item.querySelector('link');
            /* In RSS XML, <link> text is a sibling text node */
            const link = rawLink ? (rawLink.textContent || rawLink.nextSibling?.nodeValue || '').trim() : '';
            return {
                title: item.querySelector('title')?.textContent?.trim() || 'Untitled',
                link: link || 'https://murphonomics.substack.com/',
                pubDate: new Date(item.querySelector('pubDate')?.textContent || 0)
            };
        }).sort((a, b) => b.pubDate - a.pubDate);

        container.innerHTML = posts.map(post => {
            const dateStr = post.pubDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return `
                <a class="substack-post" href="${post.link}" target="_blank" rel="noopener noreferrer">
                    <span class="substack-post-date">${dateStr}</span>
                    <span class="substack-post-title">${post.title}</span>
                </a>`;
        }).join('');

    } catch {
        /* Fallback: show known articles statically (fetch fails on file:// protocol) */
        const fallbackPosts = [
            { title: 'The Trump Economy', link: 'https://murphonomics.substack.com/p/the-trump-economy', date: '' }
        ];
        container.innerHTML = fallbackPosts.map(post => `
            <a class="substack-post" href="${post.link}" target="_blank" rel="noopener noreferrer">
                ${post.date ? `<span class="substack-post-date">${post.date}</span>` : ''}
                <span class="substack-post-title">${post.title}</span>
            </a>`).join('');
    }
}

function calculateYoYChange(observations) {
    const validData = observations.filter(obs => obs.value && obs.value !== '.');
    if (validData.length < 12) return 0;
    
    const latest = parseFloat(validData[validData.length - 1].value);
    const yearAgo = parseFloat(validData[validData.length - 13].value);
    
    if (yearAgo === 0) return 0;
    return ((latest - yearAgo) / yearAgo) * 100;
}
