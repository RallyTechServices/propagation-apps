Ext.define("catsFeatureCancellation", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'display_box'}
    ],
    integrationHeaders : {
        name : "catsFeatureCancellation"
    },

    config: {
        defaultSettings: {
            rootModelTypePath: 'PortfolioItem/Feature',
            canceledScheduleState: 'Defined',
            canceledReleaseName: 'Cancelled',
            canceledPortfolioStateName: 'Cancelled',
            canceledPrefix: '[CANCELLED] ',
            defaultColumns: 'FormattedID,Name',
            completedStoryStates: 'Accepted'
        }
    },

    launch: function() {

        Deft.Promise.all([
          Rally.technicalservices.Toolbox.fetchPortfolioItemStateRefs(this.getCanceledPortfolioStateName()),
          Rally.technicalservices.Toolbox.fetchPortfolioItemTypes(),
          Rally.technicalservices.Toolbox.fetchReleases(this.getCanceledReleaseName()),
          Rally.technicalservices.Toolbox.fetchCompletedScheduleStates()
        ])
        .then({
            success: this.initializeApp,
            failure: this.showErrorNotification,
            scope: this
        });

        this.subscribe(this, 'statusUpdate', this.statusUpdate, this);
        this.subscribe(this, 'maskUpdate', this.maskUpdate, this);
        this.subscribe(this, 'bulkActionComplete', this.statusUpdate, this);
        this.subscribe(this, 'bulkActionError', this.showErrorNotification, this);
    },
    getCanceledReleaseName: function(){
      return this.getSetting('canceledReleaseName');
    },
    getCanceledPortfolioStateName: function(){
      return this.getSetting('canceledPortfolioStateName');
    },
    getCanceledScheduleState: function(){
      return this.getSetting('canceledScheduleState');
    },
    getCanceledPrefix: function(){
      return this.getSetting('canceledPrefix');
    },
    getCompletedStates: function(){
      this.logger.log('getCompletedStates', this.getSetting('completedStates'));
      var setting = this.getSetting('completedStates');

      if ( Ext.isEmpty(setting)) {
          return this.getCompletedStoryStates();
      }
      if (!Ext.isArray(setting)){
         return setting.split(',').concat(this.getCompletedStoryStates());
      }
      return setting;
    },
    getCompletedStoryStates: function(){
      this.logger.log('getCompletedStoryStates', this.getSetting('completedStoryStates'));
      var setting = this.getSetting('completedStoryStates');

      if ( Ext.isEmpty(setting)) {
          return [];
      }
      if (!Ext.isArray(setting)){
         return setting.split(',');
      }
      return setting;
    },
    maskUpdate: function(arg){

        if (!arg || arg === ''){
            arg = false;
        }
        this.setLoading(arg);
        this.refresh();
    },
    initializeApp: function(results){
        this.portfolioItemCanceledStates = results[0];
        this.portfolioItemTypePaths = results[1];
        this.canceledReleaseHash = results[2];
        this.completedStates = results[3].concat(this.getCompletedStates());
        this.down('#display_box').removeAll();

        this.logger.log('initializeApp', results[0],results[1],results[2], this.completedStates);

        if (!Ext.Array.contains(this.portfolioItemTypePaths, this.getRootModelTypePath())){
            this.down('#display_box').add({
              xtype: 'container',
              html: "Please configure an Artifact Type in the App Settings."
            });
            return;
        }

        this.buildTreeStore();
    },
    buildTreeStore: function(){
        this.down('#display_box').removeAll();

        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: [this.getRootModelTypePath()],
            enableHierarchy: true,
            autoLoad: false
        }).then({
            success: this.buildGridboard,
            scope: this
        });
    },
    getDefaultColumns: function(){
       var defaults = ['FormattedID','Name'];
       if (this.getSetting('defaultColumns')){
          var defColumns = this.getSetting('defaultColumns');
           if (Ext.isString(this.getSetting('defaultColumns'))){
              defColumns = defColumns.split(',');
           }
           return Ext.Array.merge(defaults, defColumns);
       }
       return defaults;
    },
    buildGridboard: function(store){
        if (this.down('rallygridboard')){
            this.down('rallygridboard').destroy();
        }

        var typesToCancel = this.getTypesToCancel(),
          cancelledPrefix = this.getCanceledPrefix(),
          canceledPortfolioStateName = this.getCanceledPortfolioStateName();

        this.logger.log('buildGridboard', this.getDefaultColumns());
        this.add({
            xtype: 'rallygridboard',
            context: this.getContext(),
            modelNames: this.getRootModelTypePath(),
            toggleState: 'grid',
            gridConfig: {
                store: store,
                storeConfig: {
                    pageSize: 200
                },
                columnCfgs: this.getDefaultColumns(),
                bulkEditConfig: {
                    items: [{
                        xtype: 'rallyrecordmenuitembulkcancel' ,
                        portfolioItemTypes: this.getPortfolioItemTypePaths(),
                        canceledPortfolioStateName: canceledPortfolioStateName,
                        canceledReleaseHash: this.canceledReleaseHash,
                        canceledScheduleState: this.getCanceledScheduleState(),
                        canceledPrefix: this.getCanceledPrefix(),
                        completedStates: this.completedStates,
                        portfolioItemCanceledStates: this.portfolioItemCanceledStates,
                        types: typesToCancel
                    }]
                },
                rowActionColumnConfig: {

                  rowActionsFn: function (record) {
                      console.log('rowactionsfn', record);
                      return [
                          {
                              xtype: 'rallyrecordmenuitemrestore',
                              record: record,
                              cancelledPrefix: cancelledPrefix,
                              canceledPortfolioStateName: canceledPortfolioStateName
                          }
                      ];
                  }
                }
            },
            plugins: this.getPlugins(),
            height: this.getHeight(),
            listeners: {
                viewchange: function(gb){
                    this.buildTreeStore();
                },
                scope: this
            }
        });

    },
    getPlugins: function(){
        return [{
            ptype: 'rallygridboardfieldpicker',
            headerPosition: 'left',
            modelNames: this.getTypesToCancel(),
            stateful: true,
            stateId: this.getContext().getScopedStateId('deep-copy-columns')
        },{
            ptype: 'rallygridboardinlinefiltercontrol',
            inlineFilterButtonConfig: {
                stateful: true,
                stateId: this.getContext().getScopedStateId('deep-copy-filter'),
                modelNames: [this.getRootModelTypePath()],
                inlineFilterPanelConfig:
                {
                    collapsed: false,
                    quickFilterPanelConfig: {
                        defaultFields: ['Owner']
                    }
                }
            }
        },{
          ptype: 'rallygridboardsharedviewcontrol',
          stateful: true,
          stateId: this.getContext().getScopedStateId('cancel-view'),
          stateEvents: ['select','beforedestroy']
        }];
    },
    _updateRecordInGrid: function(store,record) {
        var oid = record.get('ObjectID');
        var items = store.findAllRecordsWithId(oid);

        if ( Ext.isEmpty(items) ) {
            this.logger.log(record.get('FormattedID'),'item not displaying in grid right now');
            return;
        }

        var changed_fields = record.get('__changedFields') || [];
        Ext.Array.each(items, function(item){
            if (Ext.isArray(changed_fields)){
              Ext.Array.each(changed_fields, function(field){
                  item.set(field,record.get(field));
              });
            }

            if (Ext.isObject(changed_fields)){
              Ext.Object.each(changed_fields, function(field, val){
                  item.set(field,val);
              });
            }
         });
        return;
    },
    statusUpdate: function(msg, isComplete,affectedRootRecords, allRecords){
        Rally.ui.notify.Notifier.hide();
        Rally.ui.notify.Notifier.show({message: msg, showForever: true});

        this.logger.log('statusUpdate',isComplete,msg, allRecords);

        var store = this.down('rallygridboard').getGridOrBoard().getStore();
        Ext.Array.each(allRecords, function(record){
            this._updateRecordInGrid(store,record);
        },this);
        this.down('rallygridboard').getGridOrBoard().getView().refresh();

        // this.down('rallygridboard').getGridOrBoard().getStore().reload({
        //   callback: function(){
        //     this.down('rallygridboard').getGridOrBoard().getView().refresh();
        //   },
        //   scope: this
        // });

    },
    getTypesToCancel: function(){

        var typesToCancel = [],
            rootModelTypePath = this.getRootModelTypePath();

        if(/PortfolioItem\//.test(rootModelTypePath)){
            Ext.Array.each(this.getPortfolioItemTypePaths(), function(p){
                typesToCancel.unshift(p);
                return p !== rootModelTypePath;
            });
        }
        return typesToCancel;
    },
    getPortfolioItemTypePaths: function(){
        return this.portfolioItemTypePaths;
    },
    getRootModelTypePath: function(){
        return this.getSetting('rootModelTypePath');
    },
    showErrorNotification: function(msg){
        this.setLoading(false);
        Rally.ui.notify.Notifier.showError({message: msg});
    },
    getSettingsFields: function(){

        var filters = [{
            property: 'TypePath',
            operator: 'contains',
            value: 'PortfolioItem/'
        }];

        var currentState = this.getSettings();

        return [{
            xtype: 'rallycombobox',
            name: 'rootModelTypePath',
            storeConfig: {
                model: 'TypeDefinition',
                fetch: ['TypePath','DisplayName'],
                filters: filters,
                remoteFilter: true
            },
            displayField: 'DisplayName',
            valueField: 'TypePath',
            fieldLabel: 'Artifact Type',
            labelAlign: 'right',
            labelWidth: 200,
            width: 400
        },{
           xtype: 'rallyreleasecombobox',
           name: 'canceledReleaseName',
           fieldLabel: 'Canceled Release Name',
           valueField: 'Name',
           displayField: 'Name',
           showArrows: false,
           labelAlign: 'right',
           labelWidth: 200,
           width: 400

        },{
           xtype: 'rallyfieldvaluecombobox',
           name: 'canceledScheduleState',
           fieldLabel: 'Canceled Schedule State',
           labelAlign:  'right',
           model: 'HierarchicalRequirement',
           field: 'ScheduleState',
           labelWidth: 200,
           width: 400,
           listeners: {
             ready: function(cb){
               cb.setValue(currentState.canceledScheduleState);
               cb.getStore().on('load', function(){
                  cb.setValue(currentState.canceledScheduleState);
               }, {single: true});
             }
           }
        },{
          xtype: 'rallycombobox',
          name: 'completedStates',
          fieldLabel: 'Completed Portfolio States',
          labelAlign:  'right',
          storeConfig: {
              model: 'State',
              fetch: ['Name','TypeDef','TypePath'],
              remoteFilter: true,
              filters: [{
                property: 'TypeDef',
                operator: '!=',
                value: ''
              },{
                property: 'Enabled',
                value: true
              }],
              sorters: [{
                property: 'Name',
                direction: 'ASC'
              }]
          },
          displayField: 'Name',
          valueField: '_ref',
          multiSelect: true,
          labelWidth: 200,
          width: 400,
          listConfig: {
              cls: 'rally-checkbox-boundlist',
              itemTpl: Ext.create('Ext.XTemplate',
                '<div class="rally-checkbox-image"></div>',
                '<div class="rally-checkbox-text">{Name:htmlEncode} (<span style="font-family:NotoSansBold, Helvetica, Arial">{[values && values.TypeDef && values.TypeDef.Name]}</span>)</div>')
          },
          listeners: {
            ready: function(cb){

              if (cb.getStore() && cb.getStore().getRange() && cb.getStore().getRange().length > 0){
                //This is to remove any weird records that might not have a TypeDef
                Ext.Array.each(cb.getStore().getRange(), function(r){
                   if (!r.getData() || !r.getData().TypeDef || !r.getData().TypeDef.Name){
                     cb.getStore().remove(r);
                   }
                });
              }
              cb.setValue(currentState.completedStates.split(','));
              cb.getStore().on('load', function(store){
                 Ext.Array.each(cb.getStore().getRange(), function(r){
                   if (!r.getData() || !r.getData().TypeDef || !r.getData().TypeDef.Name){
                     cb.getStore().remove(r);
                   }
                 });

                 cb.setValue(currentState.completedStates.split(','));
              }, {single: true});
            }
          }
        },{
          xtype: 'rallyfieldvaluecombobox',
          name: 'completedStoryStates',
          fieldLabel: 'Completed User Story States',
          labelAlign:  'right',
          model: 'HierarchicalRequirement',
          field: 'ScheduleState',
          multiSelect: true,
          labelWidth: 200,
          width: 400,
          listeners: {
            ready: function(cb){
              if (!currentState.completedStoryStates){ return; }
              cb.setValue(currentState.completedStoryStates.split(','));
              cb.getStore().on('load', function(store){
                 cb.setValue(currentState.completedStoryStates.split(','));
              }, {single: true});
            }
          }
        },{
          xtype: 'rallyfieldcombobox',
          name: 'defaultColumns',
          fieldLabel: 'Default Columns',
          labelAlign:  'right',
          model: 'PortfolioItem',
          multiSelect: true,
          labelWidth: 200,
          width: 400,
          listeners: {
            ready: function(cb){
              var currentDefaults = currentState && currentState.defaultColumns && currentState.defaultColumns.split(',') || [];
              currentDefaults = Ext.Array.merge(['FormattedID','Name'],currentDefaults);
              cb.setValue(currentDefaults);
              cb.getStore().on('load', function(store){
                 cb.setValue(currentDefaults);
              }, {single: true});
            }
          }
        }];
    },
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },

    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }

});
