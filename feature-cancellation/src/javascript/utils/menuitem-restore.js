Ext.define('Rally.ui.menu.bulk.Restore', {
    alias: 'widget.rallyrecordmenuitemrestore',
    extend: 'Rally.ui.menu.item.RecordMenuItem',

    mixins: {
        messageable: 'Rally.Messageable'
    },

    config: {
        onBeforeAction: function(){
//            console.log('onbeforeaction');
        },

        /**
         * @cfg {Function} onActionComplete a function called when the specified menu item action has completed
         * @param Rally.data.wsapi.Model[] onActionComplete.successfulRecords any successfully modified records
         * @param Rally.data.wsapi.Model[] onActionComplete.unsuccessfulRecords any records which failed to be updated
         */
        onActionComplete: function(){
            //         console.log('onActionComplete');
        },
        text: 'Restore',

       handler: function () {
         this.restore(this.record);
       },
       predicate: function (records) {
         var record = this.record;

          if (record.get('_type').toLowerCase() === 'hierarchicalrequirement'){
             var re = new RegExp(this.cancelledPrefix);
             if (re.test(record.get('Name'))){
               return true;
             }
          }

          if (/portfolioitem/.test(record.get('_type').toLowerCase())){
              var state = record.get('State') && record.get('State').Name;

              if (state === this.canceledPortfolioStateName){
                 return true;
              }
          }
          return false;
       }
    },
    restore: function(record){

      var deferred = Ext.create('Deft.Deferred');

      find = {ObjectID: record.get('ObjectID')};
      if (record.get('_type') === 'hierarchicalrequirement'){
          find.Name = record.get('Name');
          find["_PreviousValues.Name"] = {$exists: true}
      } else {
          find.State= this.canceledPortfolioStateName,
          find["_PreviousValues.State"] = {$exists: true}
      }
    
      this.publish('maskUpdate','Searching History...');
      this._fetchLookbackRecords({
        find: find,
        fetch: ['ObjectID','Name', 'State','Release','PlanEstimate','ScheduleState','ToDo','Blocked','BlockedReason','_ValidFrom','_PreviousValues'],
        hydrate: ['State','Release'],
        sort: { "_ValidFrom": -1 }
      }).then({
        success: this._fetchItemsInHierarchy,
        failure: this._reportError,
        scope: this
      });

      // this.fireEvent('loadtree');
      // me.publish('maskUpdate', 'Retrieving Data...');
      //
      // var artifactTree = Ext.create('Rally.technicalservices.ArtifactTree',{
      //     portfolioItemTypes: this.portfolioItemTypes,
      //     portfolioItemCanceledStates: this.portfolioItemCanceledStates,
      //     canceledReleaseHash: this.canceledReleaseHash,
      //     canceledScheduleState: this.canceledScheduleState,
      //     canceledPrefix: this.canceledPrefix,
      //     completedStates: this.completedStates,
      //     listeners: {
      //         treeloaded: function(tree){
      //             me.publish('maskUpdate', 'Restoring Items...');
      //             tree.restoreItems();
      //         },
      //         completed: function(batch){
      //            // me.fireEvent('copycomplete');
      //             me.publish('maskUpdate');
      //             deferred.resolve({
      //                 record: record,
      //                 batch: batch
      //             });
      //         },
      //         error: function(errorMsg){
      //           //  me.fireEvent('copyerror',{record: record, errorMessage: errorMsg});
      //             me.publish('maskUpdate');
      //             deferred.resolve({record: record, errorMessage: errorMsg});
      //         },
      //         scope: this
      //     }
      // });
      //
      // artifactTree.load(record);
      return deferred;
    },
    _fetchItemsInHierarchy: function(records){
        if (records && records.length > 0){
           var validFrom = records[0].get('_ValidFrom');
           this._fetchLookbackRecords({
             find: {
                _TypeHierarchy: {$in: ['HierarchicalRequirement','Task','PortfolioItem']},
                _ItemHierarchy: records[0].get('ObjectID'),
                _ValidFrom: {$gte: validFrom}
             },
             fetch: ['_TypeHierarchy',
                    'ObjectID',
                    'Name',
                    'State',
                    'Release',
                    'PlanEstimate',
                    'ScheduleState',
                    'ToDo',
                    'Blocked',
                    'BlockedReason',
                    '_ValidFrom',
                    '_PreviousValues.ScheduleState',
                    '_PreviousValues.Name',
                    '_PreviousValues.Release',
                    '_PreviousValues.State',
                    '_PreviousValues.Blocked',
                    '_PreviousValues.BlockedReason',
                    '_PreviousValues.PlanEstimate',
                    '_PreviousValues.Release',
                    '_PreviousValues.ToDo'],
             hydrate: ['State','_TypeHierarchy','_PreviousValues.ScheduleState'],
             sort: { "_ValidFrom": -1 }
           }).then({
             success: function(snapshots){
                var taskUpdates = {},
                    storyUpdates = {},
                    portfolioItemUpdates = {};

                if (snapshots.length === 0){
                   this.publish('bulkActionComplete');
                   this.publish('maskUpdate',false);
                   this.publish('statusUpdate','No history found.  Try again in a few minutes.');
                   return;
                }

                Ext.Array.each(snapshots, function(s){

                   var prevValues = s.get('_PreviousValues') || {},
                        oid = s.get('ObjectID');

                   var type = s.get('_TypeHierarchy').slice(-1)[0].toLowerCase();
                   console.log('s',s.getData(), type,prevValues,s.get('_ValidFrom'));
                   if (/portfolioitem/.test(type)){
                     if (s.get("_PreviousValues.State") || s.get('_PreviousValues.State') === null){
                       portfolioItemUpdates[oid] = {
                           State: s.get('_PreviousValues.State')
                       }
                     }
                   }

                   if (type === 'hierarchicalrequirement'){
                     if (s.get('_PreviousValues.Name')){
                        storyUpdates[oid] = storyUpdates[oid] || {};
                        storyUpdates[oid].Name = s.get('_PreviousValues.Name');
                     }
                     if (s.get('_PreviousValues.Release') || s.get('_PreviousValues.Release') === null){
                        storyUpdates[oid] = storyUpdates[oid] || {};
                        storyUpdates[oid].Release = s.get('_PreviousValues.Release') && 'release/' + s.get('_PreviousValues.Release') || null;
                        console.log('rel',storyUpdates[oid].Release)
                     }
                     if (s.get('_PreviousValues.PlanEstimate') || s.get('_PreviousValues.PlanEstimate') === null){
                        storyUpdates[oid] = storyUpdates[oid] || {};
                        storyUpdates[oid].PlanEstimate = s.get('_PreviousValues.PlanEstimate');
                     }
                     if (s.get('_PreviousValues.ScheduleState')){
                        storyUpdates[oid] = storyUpdates[oid] || {};
                        storyUpdates[oid].ScheduleState = s.get('_PreviousValues.ScheduleState');
                     }
                     if (s.get('_PreviousValues.Blocked')){
                        storyUpdates[oid] = storyUpdates[oid] || {};
                        storyUpdates[oid].Blocked = s.get('_PreviousValues.Blocked');
                     }
                     if (s.get('_PreviousValues.BlockedReason')){
                        storyUpdates[oid] = storyUpdates[oid] || {};
                        storyUpdates[oid].BlockedReason = s.get('_PreviousValues.BlockedReason');
                     }
                   }

                   if (type === 'task'){
                     if (s.get('_PreviousValues.ToDo')){
                       taskUpdates[oid] = {
                           ToDo: s.get('_PreviousValues.ToDo') || 0
                       };
                     }
                   }
                });
                this.updateObjects(portfolioItemUpdates,storyUpdates,taskUpdates);
             },
             failure: this._reportError,
             scope: this
           });
        }
    },
    updateObjects: function(portfolioUpdates, storyUpdates, taskUpdates){
       var portfolioConfig = this._getConfig(portfolioUpdates,'PortfolioItem'),
          storyConfig = this._getConfig(storyUpdates, 'HierarchicalRequirement'),
          taskConfig = this._getConfig(taskUpdates, 'Task'),
          promises = [];

      promises.push(this._fetchWsapiRecords(portfolioConfig));
      promises.push(this._fetchWsapiRecords(storyConfig));
      promises.push(this._fetchWsapiRecords(taskConfig));

      this.publish('maskUpdate','Restoring Objects...');

      Deft.Promise.all(promises).then({
        success: function(results){
          var batchStore = Ext.create('Rally.data.wsapi.batch.Store',{
            data: _.flatten(results)
          });
          var recordsUpdated = [];

          Ext.Array.each(results[2],function(r){
              var fields = taskUpdates[r.get('ObjectID')];
              if (fields){
                recordsUpdated.push(r);
                Ext.Object.each(fields, function(key,val){
                   r.set(key,val);
                });
                r.set('__changedFields', fields);
              }
          });

          Ext.Array.each(results[1],function(r){
              var fields = storyUpdates[r.get('ObjectID')];
              if (fields){
                recordsUpdated.push(r);
                Ext.Object.each(fields, function(key,val){
                  r.set(key,val);
                });
                r.set('__changedFields', fields);
              }
          });

          Ext.Array.each(results[0],function(r){
              var fields = portfolioUpdates[r.get('ObjectID')];
              if (fields){
                recordsUpdated.push(r);
                Ext.Object.each(fields, function(key,val){
                   r.set(key,val);
                });
                r.set('__changedFields', fields);
              }
          });

          batchStore.sync({
              success: function(){
                var msg = Ext.String.format('{0} Records Restored.',recordsUpdated.length);
                this.publish('bulkActionComplete',msg, true, recordsUpdated, _.flatten(results));
              },
              scope: this,
              failure: this._reportError
          }).always(function(){
              this.publish('maskUpdate', false);
          },this);
        },
        failure: this._reportError,
        scope: this
      });


    },
    _getConfig: function(updates, type){
      var filters =Ext.Array.map(Ext.Object.getKeys(updates), function(oid,fields){ return {
             property: 'ObjectID',
             value: oid
           }
      });

      if (filters.length === 0){
        filters = [{
            property: 'ObjectID',
            value: 0
        }];
      }

      if (filters.length > 1){
          filters = Rally.data.wsapi.Filter.or(filters)
      }

      return {
           model: type,
           fetch: ['ObjectID'],
           filters: filters
       };
    },
    _reportError: function(msg){
      this.publish('bulkActionError', msg);
    },
    _fetchWsapiRecords: function(config){
      var deferred = Ext.create('Deft.Deferred');

      if (!config.limit){ config.limit = "Infinity"; }
      if (!config.enablePostGet) {config.enablePostGet = true; }

      Ext.create('Rally.data.wsapi.Store',config).load({
          callback: function(records,operation){
             if (operation.wasSuccessful()){
                deferred.resolve(records);
             } else {
                deferred.reject(operation.error.errors.join(","));
             }
          }
      });

      return deferred.promise;
    },
    _fetchLookbackRecords: function(config){
       var deferred = Ext.create('Deft.Deferred');

       if (!config.limit){ config.limit = "Infinity"; }
       config.removeUnauthorizedSnapshots = true;

       Ext.create('Rally.data.lookback.SnapshotStore',config).load({
           callback: function(records,operation){
              if (operation.wasSuccessful()){
                 deferred.resolve(records);
              } else {
                 deferred.reject(operation.error.errors.join(","));
              }
           }
       });

       return deferred.promise;
    }
});
