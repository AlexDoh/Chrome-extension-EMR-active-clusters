let config;
fetch('./config.json')
  .then(response => response.text())
  .then(responseText => config = JSON.parse(responseText));

if (!chrome.cookies) {
  chrome.cookies = chrome.experimental.cookies;
}

const loadEMRXhr = (region, action, parameters, successCallback, errorCallback) => {
  const payload = JSON.parse(JSON.stringify(config.commonPayload));
  payload.actions[ 0 ].action += action;
  payload.actions[ 0 ].parameters.push(parameters);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `https://${region}${config.commonPath}${config.linkExtensionPathXhr}`, true);
  xhr.setRequestHeader('Content-type', 'application/json');
  xhr.withCredentials = true;
  xhr.onload = () =>
    xhr.status !== 200 ?
      errorCallback(xhr) :
      successCallback(JSON.parse(xhr.responseText).actionResponses[ 0 ].data);
  xhr.send(JSON.stringify(payload));
};

const createMainElements = (region) => {
  const accordion = document.createElement('button');
  accordion.setAttribute('class', 'accordion');
  accordion.innerText = region.name;
  const container = document.createElement('div');
  container.setAttribute('class', 'container');
  return { accordion, container };
};

const createRowInRegionContainer = (container, text, elementType, active) => {
  const row = document.createElement(elementType);
  if (active) {
    row.classList.toggle('active');
  }
  row.classList.toggle('container__line');
  row.innerText = text;
  container.appendChild(row);
  return row;
};

const addClickForOpeningContainer = (accordion) => {
  accordion.addEventListener('click', (event) => {
    event.target.classList.toggle('active');
    const container = event.target.nextElementSibling;
    if (container.style.maxHeight) {
      container.style.maxHeight = null;
    } else {
      container.style.maxHeight = `${container.scrollHeight}px`;
    }
  });
};

const createTooltipForClusterRow = (row, cluster, groups) => {
  const tooltip = document.createElement('div');
  tooltip.classList.toggle('tooltip');
  tooltip.style.visibility = 'hidden';

  const elapsedTimeElement = document.createElement('span');
  const diffMs = Date.now() - cluster.status.timeline.creationDateTime;
  const elapsedDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const elapsedHrs = Math.floor(diffMs / (1000 * 60 * 60) % 24);
  const elapsedMins = Math.floor(diffMs / (1000 * 60) % 60);
  const elapsedSeconds = Math.floor(diffMs / (1000) % 60);
  let elapsedTime = '';
  if (elapsedDays) elapsedTime += `${elapsedDays} days `;
  if (elapsedHrs) elapsedTime += `${elapsedHrs} hours `;
  if (elapsedMins) elapsedTime += `${elapsedMins} minutes `;
  if (elapsedSeconds) elapsedTime += `${elapsedSeconds} seconds`;
  elapsedTimeElement.innerHTML = `Elapsed time - ${elapsedTime}`;
  tooltip.appendChild(elapsedTimeElement);

  const coreGroup = groups.find(group => group.instanceGroupType === 'CORE');
  const coreNodes = document.createElement('span');
  coreNodes.innerHTML = `Core nodes - ${coreGroup.runningInstanceCount}`;
  tooltip.appendChild(coreNodes);

  const taskGroup = groups.find(group => group.instanceGroupType === 'TASK');
  const taskNodes = document.createElement('span');
  taskNodes.innerHTML = `Task nodes - ${taskGroup.runningInstanceCount}`;
  tooltip.appendChild(taskNodes);

  row.appendChild(tooltip);
  return tooltip;
};

const processClusters = (region, clusters) => {
  const { accordion, container } = createMainElements(region);

  if (clusters.length) {
    container.style.padding = '0';
    const list = document.createElement('ul');
    container.appendChild(list);

    clusters.forEach(cluster => {
      const row = createRowInRegionContainer(list, `${cluster.name} - ${cluster.id} - ${cluster.status.state}`, 'li', true);

      let tooltip;
      let masterPrivateIP;
      const listInstanceGroupsPayload = config.actions.listInstanceGroups.parameters;
      listInstanceGroupsPayload.clusterId = cluster.id;
      loadEMRXhr(
        region.extension,
        config.actions.listInstanceGroups.name,
        listInstanceGroupsPayload,
        (listGroups) => {
          const masterGroupId = listGroups.instanceGroups.find(group => group.instanceGroupType === config.masterNodeName).id;
          const listInstancesPayload = config.actions.listInstances.parameters;
          listInstancesPayload.clusterId = cluster.id;
          listInstancesPayload.instanceGroupId = masterGroupId;

          tooltip = createTooltipForClusterRow(row, cluster, listGroups.instanceGroups);

          loadEMRXhr(
            region.extension,
            config.actions.listInstances.name,
            listInstancesPayload,
            (listInstances) => masterPrivateIP = listInstances.instances[ 0 ].privateIpAddress
          )
        }
      );

      row.onclick = () =>
        chrome.tabs.create({
          url: `http://${masterPrivateIP}:${config.masterPrivatePort}`,
          selected: true
        });

      row.onmouseover = () => tooltip.style.visibility = 'visible';
      row.onmouseout = () => tooltip.style.visibility = 'hidden';
    });
  }

  if (clusters.length === 0) {
    createRowInRegionContainer(container, config.noClustersText, 'p');
  }

  document.body.appendChild(accordion);
  document.body.appendChild(container);

  if (config.regions.length === document.body.querySelectorAll('button').length) {
    document.querySelector('.clusters__info').style.display = 'none';
  }

  addClickForOpeningContainer(accordion);
};

const onload = () => {
  chrome.cookies.getAll({}, cookies => {
    config.regions.forEach(region => {
      const awsCookies = cookies.filter(cookie =>
        (cookie.domain.includes(region.extension + config.commonPath) && cookie.name === config.cookieCredentials) ||
        (cookie.domain.includes(config.commonDomain) && cookie.name === config.cookieInfo)
      );
      document.cookie = awsCookies.reduce((accumulator, cookie) => cookie.name + '=' + cookie.value + ';', '');
      loadEMRXhr(
        region.extension,
        config.actions.listClustersPrivate.name,
        config.actions.listClustersPrivate.parameters,
        (response) => processClusters(region, response.clusters),
        (xhr) => {
          const infoBlock = document.querySelector('.clusters__info');
          if (xhr.status === 401 && xhr.statusText === 'Unauthorized') {
            const infoText = infoBlock.querySelector('p');
            infoText.innerHTML = config.unauthorizedText;
            const awsLink = document.createElement('a');
            awsLink.innerText = region.name;
            awsLink.title = region.name;
            awsLink.href = "";
            awsLink.onclick = (event) => {
              event.preventDefault();
              chrome.tabs.create({
                url: `https://${config.commonPath}${config.linkExtensionPathHome}?region=${region.id}`,
                selected: true
              });
            };
            infoBlock.appendChild(awsLink);
          }
        }
      )
    });
  });
};

document.addEventListener('DOMContentLoaded', () => onload());
