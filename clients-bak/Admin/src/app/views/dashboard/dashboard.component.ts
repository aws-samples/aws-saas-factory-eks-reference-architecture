/*
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { getStyle, hexToRgba } from '@coreui/coreui/dist/js/coreui-utilities';
import { CustomTooltips } from '@coreui/coreui-plugin-chartjs-custom-tooltips';
import { environment } from '../../../environments/environment';
import * as rxjs from 'rxjs';
import { map } from 'rxjs/operators';
import { TenantService } from '../../tenants/tenant.service';

interface DataSet {
  label: string;
  data: number[];
}
interface ChartData {
  tenantId: string;
  dataSet: DataSet[];
  totalOrders: number;
}

@Component({
  templateUrl: 'dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  constructor(private tenantSvc: TenantService, private http: HttpClient) { }

  public showDummyChart = !environment.usingKubeCost;
  radioModel: string = environment.usingKubeCost ? '15d' : 'Month';

  // dummyChart

  public dummyChartElements = 27;
  public dummyChartData1: Array<number> = [];
  public dummyChartData2: Array<number> = [];
  public dummyChartData3: Array<number> = [];

  public dummyChartData: Array<any> = [
    {
      data: this.dummyChartData1,
      label: 'Current'
    },
    {
      data: this.dummyChartData2,
      label: 'Previous'
    },
    {
      data: this.dummyChartData3,
      label: 'BEP'
    }
  ];
  /* tslint:disable:max-line-length */
  public dummyChartLabels: Array<any> = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Thursday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  /* tslint:enable:max-line-length */
  public dummyChartOptions: any = {
    tooltips: {
      enabled: false,
      custom: CustomTooltips,
      intersect: true,
      mode: 'index',
      position: 'nearest',
      callbacks: {
        labelColor: function (tooltipItem, chart) {
          return { backgroundColor: chart.data.datasets[tooltipItem.datasetIndex].borderColor };
        }
      }
    },
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      xAxes: [{
        gridLines: {
          drawOnChartArea: false,
        },
        ticks: {
          callback: function (value: any) {
            return value.charAt(0);
          }
        }
      }],
      yAxes: [{
        ticks: {
          beginAtZero: true,
          maxTicksLimit: 5,
          stepSize: Math.ceil(250 / 5),
          max: 250
        }
      }]
    },
    elements: {
      line: {
        borderWidth: 2
      },
      point: {
        radius: 0,
        hitRadius: 10,
        hoverRadius: 4,
        hoverBorderWidth: 3,
      }
    },
    legend: {
      display: false
    }
  };
  public dummyChartColours: Array<any> = [
    { // brandInfo
      backgroundColor: hexToRgba(getStyle('--info'), 10),
      borderColor: getStyle('--info'),
      pointHoverBackgroundColor: '#fff'
    },
    { // brandSuccess
      backgroundColor: 'transparent',
      borderColor: getStyle('--success'),
      pointHoverBackgroundColor: '#fff'
    },
    { // brandDanger
      backgroundColor: 'transparent',
      borderColor: getStyle('--danger'),
      pointHoverBackgroundColor: '#fff',
      borderWidth: 1,
      borderDash: [8, 5]
    }
  ];
  public dummyChartLegend = false;
  public dummyChartType = 'line';


  public chartData = {
    perTenantCost: void (0),
  };

  public chartOptions = {
    perTenantCost: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        xAxes: [{
          stacked: true,
        }],
        yAxes: [{
          min: 10,
          stacked: true,
          max: 250,
        }]
      },
      onClick: function(evt, ele) {
        if(ele && ele.length > 0) {
          const tenantId = ele[0]._model.label;
          window.open(`${environment.kubecostUI}/details.html?name=${tenantId}&type=namespace`, '_blank');
        }
      },
      tooltips: {
        callbacks: {
          label: (tooltipItem, data) => {
            var label = data.datasets[tooltipItem.datasetIndex].label || '';

            if (label) {
              label += ': ';
            }
            label += '$' + Math.round(tooltipItem.yLabel * 100) / 100;
            return label;
          }
        }
      }
    }
  };



  public random(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  ngOnInit(): void {
    if (!environment.usingKubeCost) {
      // generate random values for dummyChart
      for (let i = 0; i <= this.dummyChartElements; i++) {
        this.dummyChartData1.push(this.random(50, 200));
        this.dummyChartData2.push(this.random(80, 100));
        this.dummyChartData3.push(65);
      }

      return;
    }

    // fetch real data from kubecost
    this.tenantSvc.getTenants().subscribe(val => {
      const tenantIds = val.map(x => x.tenantId);
      this.getCostByTenant(tenantIds).subscribe(data => {
        this.chartData.perTenantCost = data;
      });
    }); 
  }

  private getCostByTenant(tenantIds: Array<String>) {
    const url = `${environment.apiUrl}/kubecost/model/allocation?window=15d&aggregate=namespace&accumulate=true&idle=false`;
    const data = this.http.get<any>(url);
    const chartDataTransformer = map(x => {
      const data = {
        labels: [],
        datasets: [
          { label: 'memory', data: [] },
          { label: 'cpu', data: [] },
        ],
      };
      const tenantUsageModel = x["data"][0];
      for (const [key, value] of Object.entries(tenantUsageModel)) {
        if(tenantIds.indexOf(key) < 0) {
          continue;
        }
        data.labels.push(key);
        data.datasets[0].data.push(value["ramCost"]);
        data.datasets[1].data.push(value["cpuCost"]);
      }

      return data;
    });

    return data.pipe(chartDataTransformer);
  }
}
